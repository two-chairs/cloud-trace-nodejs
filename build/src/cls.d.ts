/**
 * Copyright 2018 Google LLC
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
import { CLS, Func } from './cls/base';
import { SpanType } from './constants';
import { Logger } from './logger';
import { RootSpan } from './plugin-types';
import { Trace, TraceSpan } from './trace';
import { Singleton } from './util';
export interface RealRootContext {
    readonly span: TraceSpan;
    readonly trace: Trace;
    readonly type: SpanType.ROOT;
}
export interface PhantomRootContext {
    readonly type: SpanType.UNCORRELATED | SpanType.UNTRACED;
}
/**
 * This type represents the minimal information to store in continuation-local
 * storage for a request. We store either a root span corresponding to the
 * request, or a sentinel value (UNCORRELATED_SPAN or UNTRACED_SPAN) that tells
 * us that the request is not being traced (with the exact sentinel value
 * specifying whether this is on purpose or by accident, respectively).
 *
 * When we store an actual root span, the only information we need is its
 * current trace/span fields.
 */
export declare type RootContext = RootSpan & (RealRootContext | PhantomRootContext);
/**
 * An enumeration of the possible mechanisms for supporting context propagation
 * through continuation-local storage.
 */
export declare enum TraceCLSMechanism {
    /**
     * Use the AsyncHooksCLS class to propagate root span context.
     * Only available in Node 8+.
     */
    ASYNC_HOOKS = "async-hooks",
    /**
     * Use the AsyncListenerCLS class to propagate root span context.
     * Note that continuation-local-storage should be loaded as the first module.
     */
    ASYNC_LISTENER = "async-listener",
    /**
     * Do not use any special mechanism to propagate root span context.
     * Only a single root span can be open at a time.
     */
    SINGULAR = "singular",
    /**
     * Do not write root span context; in other words, querying the current root
     * span context will always result in a default value.
     */
    NONE = "none"
}
/**
 * Configuration options passed to the TraceCLS constructor.
 */
export interface TraceCLSConfig {
    mechanism: TraceCLSMechanism;
}
/**
 * An implementation of continuation-local storage for the Trace Agent.
 * In addition to the underlying API, there is a guarantee that when an instance
 * of this class is disabled, all context-manipulation methods will either be
 * no-ops or pass-throughs.
 */
export declare class TraceCLS implements CLS<RootContext> {
    private readonly logger;
    private currentCLS;
    private CLSClass;
    private enabled;
    static UNCORRELATED: RootContext;
    static UNTRACED: RootContext;
    /**
     * Stack traces are captured when a root span is started. Because the stack
     * trace height varies on the context propagation mechanism, to keep published
     * stack traces uniform we need to remove the top-most frames when using the
     * c-l-s module. Keep track of this number here.
     */
    readonly rootSpanStackOffset: number;
    constructor(config: TraceCLSConfig, logger: Logger);
    isEnabled(): boolean;
    enable(): void;
    disable(): void;
    getContext(): RootContext;
    runWithContext<T>(fn: Func<T>, value: RootContext): T;
    bindWithCurrentContext<T>(fn: Func<T>): Func<T>;
    patchEmitterToPropagateContext<T>(ee: EventEmitter): void;
}
export declare const cls: Singleton<TraceCLS, TraceCLSConfig, Logger>;
