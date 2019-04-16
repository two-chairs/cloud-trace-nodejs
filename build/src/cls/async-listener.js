"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * An implementation of continuation-local storage that wraps the
 * "continuation-local-storage" module.
 */
class AsyncListenerCLS {
    constructor(defaultContext) {
        // Conditionally load continuation-local-storage.
        // We make this a member field instead of assigning it to a module-scope
        // object to make its access uncomplicated.
        this.cls = require('continuation-local-storage');
        this.defaultContext = defaultContext;
    }
    isEnabled() {
        return !!this.getNamespace();
    }
    enable() {
        this.cls.createNamespace(AsyncListenerCLS.TRACE_NAMESPACE);
    }
    disable() {
        this.cls.destroyNamespace(AsyncListenerCLS.TRACE_NAMESPACE);
    }
    getNamespace() {
        return this.cls.getNamespace(AsyncListenerCLS.TRACE_NAMESPACE);
    }
    getContext() {
        const result = this.getNamespace().get(AsyncListenerCLS.ROOT_CONTEXT_KEY);
        if (result) {
            return result;
        }
        return this.defaultContext;
    }
    runWithContext(fn, value) {
        const namespace = this.getNamespace();
        return namespace.runAndReturn(() => {
            namespace.set(AsyncListenerCLS.ROOT_CONTEXT_KEY, value);
            return fn();
        });
    }
    bindWithCurrentContext(fn) {
        return this.getNamespace().bind(fn);
    }
    patchEmitterToPropagateContext(ee) {
        return this.getNamespace().bindEmitter(ee);
    }
}
AsyncListenerCLS.TRACE_NAMESPACE = 'com.google.cloud.trace';
AsyncListenerCLS.ROOT_CONTEXT_KEY = 'root';
exports.AsyncListenerCLS = AsyncListenerCLS;
//# sourceMappingURL=async-listener.js.map