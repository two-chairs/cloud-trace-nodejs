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
import * as common from '@google-cloud/common';
import { Logger } from './logger';
import { Trace } from './trace';
import { Singleton } from './util';
export interface TraceWriterConfig extends common.GoogleAuthOptions {
    projectId?: string;
    onUncaughtException: string;
    bufferSize: number;
    flushDelaySeconds: number;
    stackTraceLimit: number;
    maximumLabelValueSize: number;
    serviceContext: {
        service?: string;
        version?: string;
        minorVersion?: string;
    };
}
export interface LabelObject {
    [key: string]: string;
}
export declare class TraceBuffer {
    /**
     * Buffered traces.
     */
    private traces;
    /**
     * Number of buffered spans; this number must be at least as large as
     * buffer.length.
     */
    private numSpans;
    /**
     * Add a new trace to the buffer.
     * @param trace The trace to add.
     */
    add(trace: Trace): void;
    /**
     * Gets the number of spans contained within buffered traces.
     */
    getNumSpans(): number;
    /**
     * Clears the buffer, returning its original contents.
     */
    drain(): Trace[];
}
/**
 * A class representing a service that publishes traces in the background.
 */
export declare class TraceWriter extends common.Service {
    private readonly config;
    private readonly logger;
    /** Traces to be published */
    protected buffer: TraceBuffer;
    /** Default labels to be attached to written spans */
    defaultLabels: LabelObject;
    /** Reference to global unhandled exception handler */
    private unhandledException?;
    /** Whether the trace writer is active */
    isActive: boolean;
    /**
     * Constructs a new TraceWriter instance.
     * @param config A config object containing information about
     *   authorization credentials.
     * @param logger The Trace Agent's logger object.
     * @constructor
     */
    constructor(config: TraceWriterConfig, logger: Logger);
    stop(): void;
    getConfig(): TraceWriterConfig;
    initialize(): Promise<void>;
    private getHostname;
    private getInstanceId;
    getProjectId(): Promise<string>;
    /**
     * Queues a trace to be published. Spans with no end time are excluded.
     *
     * @param trace The trace to be queued.
     */
    writeTrace(trace: Trace): void;
    /**
     * Flushes the buffer of traces at a regular interval controlled by the
     * flushDelay property of this TraceWriter's config.
     */
    private scheduleFlush;
    /**
     * Serializes the buffered traces to be published asynchronously.
     */
    private flushBuffer;
    /**
     * Publishes flushed traces to the network.
     * @param json The stringified json representation of the queued traces.
     */
    protected publish(json: string): void;
}
export declare const traceWriter: Singleton<TraceWriter, TraceWriterConfig, Logger>;
