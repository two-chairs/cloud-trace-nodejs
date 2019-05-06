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
import { SpanType } from './constants';
import { RootSpan, Span, SpanOptions } from './plugin-types';
import { Trace, TraceSpan } from './trace';
/**
 * Represents a real trace span.
 */
export declare abstract class BaseSpanData implements Span {
    readonly trace: Trace;
    readonly span: TraceSpan;
    abstract readonly type: SpanType;
    /**
     * Creates a trace context object.
     * @param trace The object holding the spans comprising this trace.
     * @param spanName The name of the span.
     * @param parentSpanId The ID of the parent span, or '0' to specify that there
     *                     is none.
     * @param skipFrames the number of frames to remove from the top of the stack
     *                   when collecting the stack trace.
     */
    constructor(trace: Trace, spanName: string, parentSpanId: string, skipFrames: number);
    getTraceContext(): string;
    addLabel(key: string, value: any): void;
    endSpan(timestamp?: Date): void;
    setParentSpanId(parentSpanId: string): void;
}
/**
 * Represents a real root span, which corresponds to an incoming request.
 */
export declare class RootSpanData extends BaseSpanData implements RootSpan {
    readonly type = SpanType.ROOT;
    private children;
    constructor(trace: Trace, spanName: string, parentSpanId: string, skipFrames: number);
    createChildSpan(options?: SpanOptions): Span;
    endSpan(timestamp?: Date): void;
}
/**
 * Represents a real child span, which corresponds to an outgoing RPC.
 */
export declare class ChildSpanData extends BaseSpanData {
    readonly type = SpanType.CHILD;
    shouldSelfPublish: boolean;
    constructor(trace: Trace, spanName: string, parentSpanId: string, skipFrames: number);
    endSpan(timestamp?: Date): void;
}
/**
 * A virtual trace span that indicates that a real child span couldn't be
 * created because the correct root span couldn't be determined.
 */
export declare const UNCORRELATED_CHILD_SPAN: Span & {
    readonly type: SpanType.UNCORRELATED;
};
/**
 * A virtual trace span that indicates that a real child span couldn't be
 * created because the corresponding root span was disallowed by user
 * configuration.
 */
export declare const UNTRACED_CHILD_SPAN: Span & {
    readonly type: SpanType.UNTRACED;
};
/**
 * A virtual trace span that indicates that a real root span couldn't be
 * created because an active root span context already exists.
 */
export declare const UNCORRELATED_ROOT_SPAN: any;
/**
 * A virtual trace span that indicates that a real root span couldn't be
 * created because it was disallowed by user configuration.
 */
export declare const UNTRACED_ROOT_SPAN: any;
