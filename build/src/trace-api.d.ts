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
/// <reference types="node" />
import { EventEmitter } from 'events';
import { SpanType } from './constants';
import { Logger } from './logger';
import { Func, RootSpan, RootSpanOptions, Span, SpanOptions, Tracer } from './plugin-types';
import { TracePolicyConfig } from './tracing-policy';
import * as util from './util';
/**
 * An enumeration of the different possible types of behavior when dealing with
 * incoming trace context. Requests are still subject to local tracing policy.
 */
export declare enum TraceContextHeaderBehavior {
    /**
     * Respect the trace context header if it exists; otherwise, trace the
     * request as a new trace.
     */
    DEFAULT = "default",
    /**
     * Respect the trace context header if it exists; otherwise, treat the
     * request as unsampled and don't trace it.
     */
    REQUIRE = "require",
    /**
     * Trace every request as a new trace, even if trace context exists.
     */
    IGNORE = "ignore"
}
/**
 * An interface describing configuration fields read by the StackdriverTracer
 * object. This includes fields read by the trace policy.
 */
export interface StackdriverTracerConfig extends TracePolicyConfig {
    enhancedDatabaseReporting: boolean;
    contextHeaderBehavior: TraceContextHeaderBehavior;
    rootSpanNameOverride: (path: string) => string;
    spansPerTraceSoftLimit: number;
    spansPerTraceHardLimit: number;
}
/**
 * StackdriverTracer exposes a number of methods to create trace spans and
 * propagate trace context across asynchronous boundaries.
 */
export declare class StackdriverTracer implements Tracer {
    readonly constants: {
        TRACE_CONTEXT_GRPC_METADATA_NAME: string;
        TRACE_CONTEXT_HEADER_NAME: string;
        TRACE_AGENT_REQUEST_HEADER: string;
        TRACE_OPTIONS_TRACE_ENABLED: number;
        TRACE_SERVICE_SPAN_NAME_LIMIT: number;
        TRACE_SERVICE_LABEL_KEY_LIMIT: number;
        TRACE_SERVICE_LABEL_VALUE_LIMIT: number;
    };
    readonly labels: {
        HTTP_RESPONSE_CODE_LABEL_KEY: string;
        HTTP_URL_LABEL_KEY: string;
        HTTP_METHOD_LABEL_KEY: string;
        HTTP_RESPONSE_SIZE_LABEL_KEY: string;
        STACK_TRACE_DETAILS_KEY: string;
        ERROR_DETAILS_NAME: string;
        ERROR_DETAILS_MESSAGE: string;
        GAE_VERSION: string;
        GAE_MODULE_NAME: string;
        GAE_MODULE_VERSION: string;
        GCE_INSTANCE_ID: string;
        GCE_HOSTNAME: string;
        HTTP_SOURCE_IP: string;
        AGENT_DATA: string;
    };
    readonly spanTypes: typeof SpanType;
    readonly traceContextUtils: {
        encodeAsString: typeof util.generateTraceContext;
        decodeFromString: typeof util.parseContextFromHeader;
        encodeAsByteArray: typeof util.serializeTraceContext;
        decodeFromByteArray: typeof util.deserializeTraceContext;
    };
    private enabled;
    private pluginName;
    private pluginNameToLog;
    private logger;
    private config;
    private policy;
    /**
     * Constructs a new StackdriverTracer instance.
     * @param name A string identifying this StackdriverTracer instance in logs.
     */
    constructor(name: string);
    /**
     * Enables this instance. This function is only for internal use and
     * unit tests. A separate TraceWriter instance should be initialized
     * beforehand.
     * @param config An object specifying how this instance should
     * be configured.
     * @param logger A logger object.
     * @private
     */
    enable(config: StackdriverTracerConfig, logger: Logger): void;
    /**
     * Disable this instance. This function is only for internal use and
     * unit tests.
     * @private
     */
    disable(): void;
    /**
     * Returns whether the StackdriverTracer instance is active. This function is
     * only for internal use and unit tests; under normal circumstances it will
     * always return true.
     * @private
     */
    isActive(): boolean;
    enhancedDatabaseReportingEnabled(): boolean;
    getConfig(): StackdriverTracerConfig;
    runInRootSpan<T>(options: RootSpanOptions, fn: (span: RootSpan) => T): T;
    getCurrentRootSpan(): RootSpan;
    getCurrentContextId(): string | null;
    getProjectId(): Promise<string>;
    getWriterProjectId(): string | null;
    createChildSpan(options?: SpanOptions): Span;
    isRealSpan(span: Span): boolean;
    getResponseTraceContext(incomingTraceContext: string | null, isTraced: boolean): string;
    wrap<T>(fn: Func<T>): Func<T>;
    wrapEmitter(emitter: EventEmitter): void;
}
