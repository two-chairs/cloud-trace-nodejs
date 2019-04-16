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
class Sampler {
    constructor(samplesPerSecond) {
        if (samplesPerSecond > 1000) {
            samplesPerSecond = 1000;
        }
        this.traceWindow = 1000 / samplesPerSecond;
        this.nextTraceStart = Date.now();
    }
    shouldTrace(dateMillis) {
        if (dateMillis < this.nextTraceStart) {
            return false;
        }
        this.nextTraceStart = dateMillis + this.traceWindow;
        return true;
    }
}
class URLFilter {
    constructor(filterUrls) {
        this.filterUrls = filterUrls;
    }
    shouldTrace(url) {
        return !this.filterUrls.some((candidate) => {
            return (typeof candidate === 'string' && candidate === url) ||
                !!url.match(candidate);
        });
    }
}
class MethodsFilter {
    constructor(filterMethods) {
        this.filterMethods = filterMethods;
    }
    shouldTrace(method) {
        return !this.filterMethods.some((candidate) => {
            return (candidate.toLowerCase() === method.toLowerCase());
        });
    }
}
/**
 * A class that makes decisions about whether a trace should be created.
 */
class TracePolicy {
    /**
     * Constructs a new TracePolicy instance.
     * @param config Configuration for the TracePolicy instance.
     */
    constructor(config) {
        if (config.samplingRate === 0) {
            this.sampler = { shouldTrace: () => true };
        }
        else if (config.samplingRate < 0) {
            this.sampler = { shouldTrace: () => false };
        }
        else {
            this.sampler = new Sampler(config.samplingRate);
        }
        if (config.ignoreUrls.length === 0) {
            this.urlFilter = { shouldTrace: () => true };
        }
        else {
            this.urlFilter = new URLFilter(config.ignoreUrls);
        }
        if (config.ignoreMethods.length === 0) {
            this.methodsFilter = { shouldTrace: () => true };
        }
        else {
            this.methodsFilter = new MethodsFilter(config.ignoreMethods);
        }
    }
    /**
     * Given a timestamp and URL, decides if a trace should be created.
     * @param options Fields that help determine whether a trace should be
     *                created.
     */
    shouldTrace(options) {
        return this.sampler.shouldTrace(options.timestamp) &&
            this.urlFilter.shouldTrace(options.url) &&
            this.methodsFilter.shouldTrace(options.method);
    }
    static always() {
        return new TracePolicy({ samplingRate: 0, ignoreUrls: [], ignoreMethods: [] });
    }
    static never() {
        return new TracePolicy({ samplingRate: -1, ignoreUrls: [], ignoreMethods: [] });
    }
}
exports.TracePolicy = TracePolicy;
//# sourceMappingURL=tracing-policy.js.map