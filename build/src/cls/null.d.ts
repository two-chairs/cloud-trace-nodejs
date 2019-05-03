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
import { CLS, Func } from './base';
/**
 * A trivial implementation of continuation-local storage where context takes on
 * a default, immutable value.
 */
export declare class NullCLS<Context> implements CLS<Context> {
    private readonly defaultContext;
    private enabled;
    constructor(defaultContext: Context);
    isEnabled(): boolean;
    enable(): void;
    disable(): void;
    getContext(): Context;
    runWithContext<T>(fn: Func<T>): T;
    bindWithCurrentContext<T>(fn: Func<T>): Func<T>;
    patchEmitterToPropagateContext(ee: EventEmitter): void;
}