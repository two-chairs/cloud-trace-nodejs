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
/**
 * Options for constructing a TracePolicy instance.
 */
export interface TracePolicyConfig {
    /**
     * A field that controls time-based sampling.
     */
    samplingRate: number;
    /**
     * A field that controls a url-based filter.
     */
    ignoreUrls: Array<string | RegExp>;
    /**
     * A field that controls a method filter.
     */
    ignoreMethods: string[];
}
/**
 * A class that makes decisions about whether a trace should be created.
 */
export declare class TracePolicy {
    private readonly sampler;
    private readonly urlFilter;
    private readonly methodsFilter;
    /**
     * Constructs a new TracePolicy instance.
     * @param config Configuration for the TracePolicy instance.
     */
    constructor(config: TracePolicyConfig);
    /**
     * Given a timestamp and URL, decides if a trace should be created.
     * @param options Fields that help determine whether a trace should be
     *                created.
     */
    shouldTrace(options: {
        timestamp: number;
        url: string;
        method: string;
    }): boolean;
    static always(): TracePolicy;
    static never(): TracePolicy;
}
