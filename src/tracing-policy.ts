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

interface TracePolicyPredicate<T> {
  shouldTrace: (value: T) => boolean;
}

class Sampler implements TracePolicyPredicate<number> {
  private readonly traceWindow: number;
  private nextTraceStart: number;

  constructor(samplesPerSecond: number, nextTraceStart?: number) {
    if (samplesPerSecond > 1000) {
      samplesPerSecond = 1000;
    }
    this.traceWindow = 1000 / samplesPerSecond;
    this.nextTraceStart = Date.now();
  }

  shouldTrace(dateMillis: number): boolean {
    if (dateMillis < this.nextTraceStart) {
      return false;
    }
    this.nextTraceStart = dateMillis + this.traceWindow;
    return true;
  }
}

interface MultiSamplerArgs {
  name?: string;
  dateMillis: number;
}

class MultiSampler implements TracePolicyPredicate<MultiSamplerArgs> {
  private readonly samplers: Record<string, Sampler>;
  private readonly samplesPerSecond: number;
  private unnamedSampler: Sampler;
  private samplerStart: number;

  constructor(samplesPerSecond: number) {
    if (samplesPerSecond > 1000) {
      samplesPerSecond = 1000;
    }
    this.samplesPerSecond = samplesPerSecond;
    this.samplers = {};
    this.unnamedSampler = new Sampler(samplesPerSecond);
    this.samplerStart = new Date().getTime();
  }

  shouldTrace({name, dateMillis}: MultiSamplerArgs): boolean {
    const sampler: Sampler|undefined = this.getSampler(name);

    return sampler.shouldTrace(dateMillis);
  }

  private getSampler(name?: string) {
    if (!name) {
      return this.unnamedSampler;
    }

    let sampler: Sampler|undefined = this.samplers[name];
    if (!sampler) {
      this.samplers[name] = sampler =
          new Sampler(this.samplesPerSecond, this.samplerStart);
    }
    return sampler;
  }
}

class URLFilter implements TracePolicyPredicate<string> {
  constructor(private readonly filterUrls: Array<string|RegExp>) {}

  shouldTrace(url: string) {
    return !this.filterUrls.some((candidate) => {
      return (typeof candidate === 'string' && candidate === url) ||
          !!url.match(candidate);
    });
  }
}

class MethodsFilter implements TracePolicyPredicate<string> {
  constructor(private readonly filterMethods: string[]) {}

  shouldTrace(method: string) {
    return !this.filterMethods.some((candidate) => {
      return (candidate.toLowerCase() === method.toLowerCase());
    });
  }
}

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
  ignoreUrls: Array<string|RegExp>;
  /**
   * A field that controls a method filter.
   */
  ignoreMethods: string[];
}

/**
 * A class that makes decisions about whether a trace should be created.
 */
export class TracePolicy {
  private readonly sampler: TracePolicyPredicate<MultiSamplerArgs>;
  private readonly urlFilter: TracePolicyPredicate<string>;
  private readonly methodsFilter: TracePolicyPredicate<string>;

  /**
   * Constructs a new TracePolicy instance.
   * @param config Configuration for the TracePolicy instance.
   */
  constructor(config: TracePolicyConfig) {
    if (config.samplingRate === 0) {
      this.sampler = {shouldTrace: () => true};
    } else if (config.samplingRate < 0) {
      this.sampler = {shouldTrace: () => false};
    } else {
      this.sampler = new MultiSampler(config.samplingRate);
    }
    if (config.ignoreUrls.length === 0) {
      this.urlFilter = {shouldTrace: () => true};
    } else {
      this.urlFilter = new URLFilter(config.ignoreUrls);
    }
    if (config.ignoreMethods.length === 0) {
      this.methodsFilter = {shouldTrace: () => true};
    } else {
      this.methodsFilter = new MethodsFilter(config.ignoreMethods);
    }
  }

  /**
   * Given a timestamp and URL, decides if a trace should be created.
   * @param options Fields that help determine whether a trace should be
   *                created.
   */
  shouldTrace(options: {
    name?: string, timestamp: number, url: string, method: string
  }): boolean {
    return this.urlFilter.shouldTrace(options.url) &&
        this.methodsFilter.shouldTrace(options.method) &&
        this.sampler.shouldTrace(
            {name: options.name, dateMillis: options.timestamp});
  }

  static always(): TracePolicy {
    return new TracePolicy(
        {samplingRate: 0, ignoreUrls: [], ignoreMethods: []});
  }

  static never(): TracePolicy {
    return new TracePolicy(
        {samplingRate: -1, ignoreUrls: [], ignoreMethods: []});
  }
}
