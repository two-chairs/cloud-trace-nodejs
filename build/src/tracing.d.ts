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
import { CLSMechanism } from './config';
import { StackdriverTracer } from './trace-api';
import { PluginLoaderConfig } from './trace-plugin-loader';
import { TraceWriterConfig } from './trace-writer';
import { Component, Singleton } from './util';
export interface TopLevelConfig {
    enabled: boolean;
    logLevel: number;
    clsMechanism: CLSMechanism;
}
export declare type NormalizedConfig = ((TraceWriterConfig & PluginLoaderConfig & TopLevelConfig) | {
    enabled: false;
});
/**
 * A class that represents automatic tracing.
 */
export declare class Tracing implements Component {
    private readonly traceAgent;
    /** A logger. */
    private readonly logger;
    /** The configuration object for this instance. */
    private readonly config;
    /**
     * Constructs a new Tracing instance.
     * @param config The configuration for this instance.
     * @param traceAgent An object representing the custom tracing API.
     */
    constructor(config: NormalizedConfig, traceAgent: StackdriverTracer);
    /**
     * Logs an error message detailing the list of modules that were loaded before
     * the Trace Agent. Loading these modules before the Trace Agent may prevent
     * us from monkeypatching those modules for automatic tracing.
     * @param filesLoadedBeforeTrace The list of files that were loaded using
     * require() before the Stackdriver Trace Agent was required.
     */
    logModulesLoadedBeforeTrace(filesLoadedBeforeTrace: string[]): void;
    /**
     * Enables automatic tracing support and the custom span API.
     */
    enable(): void;
    /**
     * Disables automatic tracing support. This disables the publicly exposed
     * custom span API, as well as any instances passed to plugins. This also
     * prevents the Trace Writer from publishing additional traces.
     */
    disable(): void;
}
export declare const tracing: Singleton<Tracing, {
    enabled: false;
} | (TraceWriterConfig & PluginLoaderConfig & TopLevelConfig), StackdriverTracer>;
