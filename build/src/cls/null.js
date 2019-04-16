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
 * A trivial implementation of continuation-local storage where context takes on
 * a default, immutable value.
 */
class NullCLS {
    constructor(defaultContext) {
        this.defaultContext = defaultContext;
        this.enabled = false;
    }
    isEnabled() {
        return this.enabled;
    }
    enable() {
        this.enabled = true;
    }
    disable() {
        this.enabled = false;
    }
    getContext() {
        return this.defaultContext;
    }
    runWithContext(fn) {
        return fn();
    }
    bindWithCurrentContext(fn) {
        return fn;
    }
    patchEmitterToPropagateContext(ee) { }
}
exports.NullCLS = NullCLS;
//# sourceMappingURL=null.js.map