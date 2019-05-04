"use strict";
/**
 * Copyright 2017 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const is = require("is");
const uuid = require("uuid");
const cls_1 = require("./cls");
const constants_1 = require("./constants");
const span_data_1 = require("./span-data");
const trace_labels_1 = require("./trace-labels");
const trace_writer_1 = require("./trace-writer");
const tracing_policy_1 = require("./tracing-policy");
const util = require("./util");
/**
 * An enumeration of the different possible types of behavior when dealing with
 * incoming trace context. Requests are still subject to local tracing policy.
 */
var TraceContextHeaderBehavior;
(function (TraceContextHeaderBehavior) {
    /**
     * Respect the trace context header if it exists; otherwise, trace the
     * request as a new trace.
     */
    TraceContextHeaderBehavior["DEFAULT"] = "default";
    /**
     * Respect the trace context header if it exists; otherwise, treat the
     * request as unsampled and don't trace it.
     */
    TraceContextHeaderBehavior["REQUIRE"] = "require";
    /**
     * Trace every request as a new trace, even if trace context exists.
     */
    TraceContextHeaderBehavior["IGNORE"] = "ignore";
    /**
     * Respect the trace context header and **always** trace it, ignoring local
     * trace policies such as sampling rate, url, and method; otherwise, trace the
     * request as a new trace and apply policies.
     */
    TraceContextHeaderBehavior["END_TO_END"] = "end-to-end";
})(TraceContextHeaderBehavior = exports.TraceContextHeaderBehavior || (exports.TraceContextHeaderBehavior = {}));
/**
 * Type guard that returns whether an object is a string or not.
 */
// tslint:disable-next-line:no-any
function isString(obj) {
    return is.string(obj);
}
/**
 * StackdriverTracer exposes a number of methods to create trace spans and
 * propagate trace context across asynchronous boundaries.
 */
class StackdriverTracer {
    /**
     * Constructs a new StackdriverTracer instance.
     * @param name A string identifying this StackdriverTracer instance in logs.
     */
    constructor(name) {
        this.constants = constants_1.Constants;
        this.labels = trace_labels_1.TraceLabels;
        this.spanTypes = constants_1.SpanType;
        this.traceContextUtils = {
            encodeAsString: util.generateTraceContext,
            decodeFromString: util.parseContextFromHeader,
            encodeAsByteArray: util.serializeTraceContext,
            decodeFromByteArray: util.deserializeTraceContext
        };
        this.enabled = false;
        this.logger = null;
        this.config = null;
        this.policy = null;
        this.pluginName = name;
        this.pluginNameToLog = this.pluginName ? this.pluginName : 'no-plugin-name';
        this.disable(); // disable immediately
    }
    /**
     * Enables this instance. This function is only for internal use and
     * unit tests. A separate TraceWriter instance should be initialized
     * beforehand.
     * @param config An object specifying how this instance should
     * be configured.
     * @param logger A logger object.
     * @private
     */
    enable(config, logger) {
        this.logger = logger;
        this.config = config;
        this.policy = new tracing_policy_1.TracePolicy(config);
        this.enabled = true;
    }
    /**
     * Disable this instance. This function is only for internal use and
     * unit tests.
     * @private
     */
    disable() {
        // Even though plugins should be unpatched, setting a new policy that
        // never generates traces allows persisting wrapped methods (either because
        // they are already instantiated or the plugin doesn't unpatch them) to
        // short-circuit out of trace generation logic.
        this.policy = tracing_policy_1.TracePolicy.never();
        this.enabled = false;
    }
    /**
     * Returns whether the StackdriverTracer instance is active. This function is
     * only for internal use and unit tests; under normal circumstances it will
     * always return true.
     * @private
     */
    isActive() {
        return this.enabled;
    }
    enhancedDatabaseReportingEnabled() {
        return !!this.config && this.config.enhancedDatabaseReporting;
    }
    getConfig() {
        if (!this.config) {
            throw new Error('Configuration is not available.');
        }
        return this.config;
    }
    runInRootSpan(options, fn) {
        if (!this.isActive()) {
            return fn(span_data_1.UNTRACED_ROOT_SPAN);
        }
        options = options || { name: '' };
        // Don't create a root span if we are already in a root span
        const rootSpan = cls_1.cls.get().getContext();
        if (rootSpan.type === constants_1.SpanType.ROOT && !rootSpan.span.endTime) {
            this.logger.warn(`TraceApi#runInRootSpan: [${this.pluginNameToLog}] Cannot create nested root spans.`);
            return fn(span_data_1.UNCORRELATED_ROOT_SPAN);
        }
        // Attempt to read incoming trace context.
        const incomingTraceContext = { options: 1 };
        let parsedContext = null;
        if (isString(options.traceContext) &&
            this.config.contextHeaderBehavior !==
                TraceContextHeaderBehavior.IGNORE) {
            parsedContext = util.parseContextFromHeader(options.traceContext);
        }
        let ignoreLocalPolicy = false;
        if (parsedContext) {
            if (parsedContext.options &&
                this.config.contextHeaderBehavior ===
                    TraceContextHeaderBehavior.END_TO_END) {
                ignoreLocalPolicy = true;
            }
            if (parsedContext.options === undefined) {
                // If there are no incoming option flags, default to 0x1.
                parsedContext.options = 1;
            }
            Object.assign(incomingTraceContext, parsedContext);
        }
        else if (this.config.contextHeaderBehavior ===
            TraceContextHeaderBehavior.REQUIRE) {
            incomingTraceContext.options = 0;
        }
        // Consult the trace policy.
        const locallyAllowed = ignoreLocalPolicy || this.policy.shouldTrace({
            timestamp: Date.now(),
            url: options.url || '',
            method: options.method || ''
        });
        const remotelyAllowed = !!(incomingTraceContext.options & constants_1.Constants.TRACE_OPTIONS_TRACE_ENABLED);
        let rootContext;
        // Don't create a root span if the trace policy disallows it.
        if (!locallyAllowed || !remotelyAllowed) {
            rootContext = span_data_1.UNTRACED_ROOT_SPAN;
        }
        else {
            // Create a new root span, and invoke fn with it.
            const traceId = incomingTraceContext.traceId || (uuid.v4().split('-').join(''));
            const parentId = incomingTraceContext.spanId || '0';
            const name = this.config.rootSpanNameOverride(options.name);
            rootContext = new span_data_1.RootSpanData({ projectId: '', traceId, spans: [] }, /* Trace object */ name, /* Span name */ parentId, /* Parent's span ID */ options.skipFrames || 0);
        }
        return cls_1.cls.get().runWithContext(() => {
            return fn(rootContext);
        }, rootContext);
    }
    getCurrentRootSpan() {
        if (!this.isActive()) {
            return span_data_1.UNTRACED_ROOT_SPAN;
        }
        return cls_1.cls.get().getContext();
    }
    getCurrentContextId() {
        // In v3, this will be deprecated for getCurrentRootSpan.
        const traceContext = this.getCurrentRootSpan().getTraceContext();
        const parsedTraceContext = util.parseContextFromHeader(traceContext);
        return parsedTraceContext ? parsedTraceContext.traceId : null;
    }
    getProjectId() {
        if (trace_writer_1.traceWriter.exists() && trace_writer_1.traceWriter.get().isActive) {
            return trace_writer_1.traceWriter.get().getProjectId();
        }
        else {
            return Promise.reject(new Error('The Project ID could not be retrieved.'));
        }
    }
    getWriterProjectId() {
        // In v3, this will be deprecated for getProjectId.
        if (trace_writer_1.traceWriter.exists() && trace_writer_1.traceWriter.get().isActive) {
            return trace_writer_1.traceWriter.get().projectId;
        }
        else {
            return null;
        }
    }
    createChildSpan(options) {
        if (!this.isActive()) {
            return span_data_1.UNTRACED_CHILD_SPAN;
        }
        options = options || { name: '' };
        const rootSpan = cls_1.cls.get().getContext();
        if (rootSpan.type === constants_1.SpanType.ROOT) {
            if (!!rootSpan.span.endTime) {
                // A closed root span suggests that we either have context confusion or
                // some work is being done after the root request has been completed.
                // The first case could lead to a memory leak, if somehow all spans end
                // up getting misattributed to the same root span – we get a root span
                // with continuously growing number of child spans. The second case
                // seems to have some value, but isn't representable. The user probably
                // needs a custom outer span that encompasses the entirety of work.
                this.logger.warn(`TraceApi#createChildSpan: [${this.pluginNameToLog}] Creating phantom child span [${options.name}] because root span [${rootSpan.span.name}] was already closed.`);
                return span_data_1.UNCORRELATED_CHILD_SPAN;
            }
            if (rootSpan.trace.spans.length >= this.config.spansPerTraceHardLimit) {
                // As in the previous case, a root span with a large number of child
                // spans suggests a memory leak stemming from context confusion. This
                // is likely due to userspace task queues or Promise implementations.
                this.logger.error(`TraceApi#createChildSpan: [${this.pluginNameToLog}] Creating phantom child span [${options.name}] because the trace with root span [${rootSpan.span.name}] has reached a limit of ${this.config
                    .spansPerTraceHardLimit} spans. This is likely a memory leak.`);
                this.logger.error([
                    'TraceApi#createChildSpan: Please see',
                    'https://github.com/googleapis/cloud-trace-nodejs/wiki',
                    'for details and suggested actions.'
                ].join(' '));
                return span_data_1.UNCORRELATED_CHILD_SPAN;
            }
            if (rootSpan.trace.spans.length === this.config.spansPerTraceSoftLimit) {
                // As in the previous case, a root span with a large number of child
                // spans suggests a memory leak stemming from context confusion. This
                // is likely due to userspace task queues or Promise implementations.
                // Note that since child spans can be created by users directly on a
                // RootSpanData instance, this block might be skipped because it only
                // checks equality -- this is OK because no automatic tracing plugin
                // uses the RootSpanData API directly.
                this.logger.error(`TraceApi#createChildSpan: [${this.pluginNameToLog}] Adding child span [${options.name}] will cause the trace with root span [${rootSpan.span.name}] to contain more than ${this.config
                    .spansPerTraceSoftLimit} spans. This is likely a memory leak.`);
                this.logger.error([
                    'TraceApi#createChildSpan: Please see',
                    'https://github.com/googleapis/cloud-trace-nodejs/wiki',
                    'for details and suggested actions.'
                ].join(' '));
            }
            // Create a new child span and return it.
            const childContext = rootSpan.createChildSpan({
                name: options.name,
                skipFrames: options.skipFrames ? options.skipFrames + 1 : 1
            });
            this.logger.info(`TraceApi#createChildSpan: [${this.pluginNameToLog}] Created child span [${options.name}]`);
            return childContext;
        }
        else if (rootSpan.type === constants_1.SpanType.UNTRACED) {
            // Context wasn't lost, but there's no root span, indicating that this
            // request should not be traced.
            return span_data_1.UNTRACED_CHILD_SPAN;
        }
        else {
            // Context was lost.
            this.logger.warn(`TraceApi#createChildSpan: [${this.pluginNameToLog}] Creating phantom child span [${options.name}] because there is no root span.`);
            return span_data_1.UNCORRELATED_CHILD_SPAN;
        }
    }
    isRealSpan(span) {
        return span.type === constants_1.SpanType.ROOT || span.type === constants_1.SpanType.CHILD;
    }
    getResponseTraceContext(incomingTraceContext, isTraced) {
        if (!this.isActive() || !incomingTraceContext) {
            return '';
        }
        const traceContext = util.parseContextFromHeader(incomingTraceContext);
        if (!traceContext) {
            return '';
        }
        traceContext.options = (traceContext.options || 0) & (isTraced ? 1 : 0);
        return util.generateTraceContext(traceContext);
    }
    wrap(fn) {
        if (!this.isActive()) {
            return fn;
        }
        return cls_1.cls.get().bindWithCurrentContext(fn);
    }
    wrapEmitter(emitter) {
        if (!this.isActive()) {
            return;
        }
        cls_1.cls.get().patchEmitterToPropagateContext(emitter);
    }
}
exports.StackdriverTracer = StackdriverTracer;
//# sourceMappingURL=trace-api.js.map