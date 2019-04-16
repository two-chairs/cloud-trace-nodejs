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
export declare type ConsoleLogLevel = 'error' | 'warn' | 'info' | 'debug';
export declare type LogLevel = 'silent' | ConsoleLogLevel;
/**
 * The list of log levels.
 */
export declare const LEVELS: ReadonlyArray<LogLevel>;
export interface LoggerConfig {
    /**
     * The minimum log level that will print to the console.
     */
    level: string | false;
    /**
     * A tag to use in log messages.
     */
    tag: string;
}
export declare class Logger {
    private logger;
    constructor(opts?: Partial<LoggerConfig>);
    error(...args: Array<{}>): void;
    warn(...args: Array<{}>): void;
    debug(...args: Array<{}>): void;
    info(...args: Array<{}>): void;
}
