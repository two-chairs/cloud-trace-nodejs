"use strict";
/**
 * Copyright 2015 Google Inc. All Rights Reserved.
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
const crypto = require("crypto");
const util = require("util");
const constants_1 = require("./constants");
const trace_1 = require("./trace");
const trace_labels_1 = require("./trace-labels");
const trace_writer_1 = require("./trace-writer");
const traceUtil = require("./util");
// Use 6 bytes of randomness only as JS numbers are doubles not 64-bit ints.
const SPAN_ID_RANDOM_BYTES = 6;
// Use the faster crypto.randomFillSync when available (Node 7+) falling back to
// using crypto.randomBytes.
const spanIdBuffer = Buffer.alloc(SPAN_ID_RANDOM_BYTES);
const randomFillSync = crypto.randomFillSync;
const randomBytes = crypto.randomBytes;
const spanRandomBuffer = randomFillSync ?
    () => randomFillSync(spanIdBuffer) :
    () => randomBytes(SPAN_ID_RANDOM_BYTES);
function randomSpanId() {
    // tslint:disable-next-line:ban Needed to parse hexadecimal.
    return parseInt(spanRandomBuffer().toString('hex'), 16).toString();
}
/**
 * Represents a real trace span.
 */
class BaseSpanData {
    /**
     * Creates a trace context object.
     * @param trace The object holding the spans comprising this trace.
     * @param spanName The name of the span.
     * @param parentSpanId The ID of the parent span, or '0' to specify that there
     *                     is none.
     * @param skipFrames the number of frames to remove from the top of the stack
     *                   when collecting the stack trace.
     */
    constructor(trace, spanName, parentSpanId, skipFrames) {
        this.trace = trace;
        this.span = {
            name: traceUtil.truncate(spanName, constants_1.Constants.TRACE_SERVICE_SPAN_NAME_LIMIT),
            startTime: (new Date()).toISOString(),
            endTime: '',
            spanId: randomSpanId(),
            kind: trace_1.SpanKind.SPAN_KIND_UNSPECIFIED,
            parentSpanId,
            labels: {}
        };
        this.trace.spans.push(this.span);
        const stackFrames = traceUtil.createStackTrace(trace_writer_1.traceWriter.get().getConfig().stackTraceLimit, skipFrames, this.constructor);
        if (stackFrames.length > 0) {
            // Developer note: This is not equivalent to using addLabel, because the
            // stack trace label has its own size constraints.
            this.span.labels[trace_labels_1.TraceLabels.STACK_TRACE_DETAILS_KEY] =
                traceUtil.truncate(JSON.stringify({ stack_frame: stackFrames }), constants_1.Constants.TRACE_SERVICE_LABEL_VALUE_LIMIT);
        }
    }
    getTraceContext() {
        return traceUtil.generateTraceContext({
            traceId: this.trace.traceId.toString(),
            spanId: this.span.spanId.toString(),
            options: 1 // always traced
        });
    }
    // tslint:disable-next-line:no-any
    addLabel(key, value) {
        const k = traceUtil.truncate(key, constants_1.Constants.TRACE_SERVICE_LABEL_KEY_LIMIT);
        const stringValue = typeof value === 'string' ? value : util.inspect(value);
        const v = traceUtil.truncate(stringValue, trace_writer_1.traceWriter.get().getConfig().maximumLabelValueSize);
        this.span.labels[k] = v;
    }
    endSpan(timestamp) {
        if (!!this.span.endTime) {
            return;
        }
        timestamp = timestamp || new Date();
        this.span.endTime = timestamp.toISOString();
    }
}
exports.BaseSpanData = BaseSpanData;
/**
 * Represents a real root span, which corresponds to an incoming request.
 */
class RootSpanData extends BaseSpanData {
    constructor(trace, spanName, parentSpanId, skipFrames) {
        super(trace, spanName, parentSpanId, skipFrames);
        this.type = constants_1.SpanType.ROOT;
        // Locally-tracked list of children. Used only to determine, once this span
        // ends, whether a child still needs to be published.
        this.children = [];
        this.span.kind = trace_1.SpanKind.RPC_SERVER;
    }
    createChildSpan(options) {
        options = options || { name: '' };
        const skipFrames = options.skipFrames ? options.skipFrames + 1 : 1;
        const child = new ChildSpanData(this.trace, /* Trace object */ options.name, /* Span name */ this.span.spanId, /* Parent's span ID */ skipFrames); /* # of frames to skip in stack trace */
        this.children.push(child);
        return child;
    }
    endSpan(timestamp) {
        if (!!this.span.endTime) {
            return;
        }
        super.endSpan(timestamp);
        trace_writer_1.traceWriter.get().writeTrace(this.trace);
        this.children.forEach(child => {
            if (!child.span.endTime) {
                // Child hasn't ended yet.
                // Inform the child that it needs to self-publish.
                child.shouldSelfPublish = true;
            }
        });
        // We no longer need to keep track of our children.
        this.children = [];
    }
}
exports.RootSpanData = RootSpanData;
/**
 * Represents a real child span, which corresponds to an outgoing RPC.
 */
class ChildSpanData extends BaseSpanData {
    constructor(trace, spanName, parentSpanId, skipFrames) {
        super(trace, spanName, parentSpanId, skipFrames);
        this.type = constants_1.SpanType.CHILD;
        // Whether this span should publish itself. This is meant to be set to true
        // by the parent RootSpanData.
        this.shouldSelfPublish = false;
        this.span.kind = trace_1.SpanKind.RPC_CLIENT;
    }
    endSpan(timestamp) {
        if (!!this.span.endTime) {
            return;
        }
        super.endSpan(timestamp);
        if (this.shouldSelfPublish) {
            // Also, publish just this span.
            trace_writer_1.traceWriter.get().writeTrace({
                projectId: this.trace.projectId,
                traceId: this.trace.traceId,
                spans: [this.span]
            });
        }
    }
}
exports.ChildSpanData = ChildSpanData;
// Helper function to generate static virtual trace spans.
function createPhantomSpanData(spanType) {
    return Object.freeze(Object.assign({
        getTraceContext() {
            return '';
        },
        // tslint:disable-next-line:no-any
        addLabel(key, value) { },
        endSpan() { }
    }, { type: spanType }));
}
/**
 * A virtual trace span that indicates that a real child span couldn't be
 * created because the correct root span couldn't be determined.
 */
exports.UNCORRELATED_CHILD_SPAN = createPhantomSpanData(constants_1.SpanType.UNCORRELATED);
/**
 * A virtual trace span that indicates that a real child span couldn't be
 * created because the corresponding root span was disallowed by user
 * configuration.
 */
exports.UNTRACED_CHILD_SPAN = createPhantomSpanData(constants_1.SpanType.UNTRACED);
/**
 * A virtual trace span that indicates that a real root span couldn't be
 * created because an active root span context already exists.
 */
exports.UNCORRELATED_ROOT_SPAN = Object.freeze(Object.assign({
    createChildSpan() {
        return exports.UNCORRELATED_CHILD_SPAN;
    }
}, exports.UNCORRELATED_CHILD_SPAN));
/**
 * A virtual trace span that indicates that a real root span couldn't be
 * created because it was disallowed by user configuration.
 */
exports.UNTRACED_ROOT_SPAN = Object.freeze(Object.assign({
    createChildSpan() {
        return exports.UNTRACED_CHILD_SPAN;
    }
}, exports.UNTRACED_CHILD_SPAN));
//# sourceMappingURL=span-data.js.map