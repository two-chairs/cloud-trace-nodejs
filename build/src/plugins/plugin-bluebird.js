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
const shimmer = require("shimmer");
const plugin = [{
        // Bluebird is a class.
        // tslint:disable-next-line:variable-name
        patch: (Bluebird, tracer) => {
            // any is a type arg; args are type checked when read directly, otherwise
            // passed through to a function with the same type signature.
            // tslint:disable:no-any
            const wrapIfFunction = (fn) => typeof fn === 'function' ? tracer.wrap(fn) : fn;
            shimmer.wrap(Bluebird.prototype, '_then', (thenFn) => {
                // Inherit context from the call site of .then().
                return function (...args) {
                    return thenFn.apply(this, [
                        wrapIfFunction(args[0]), wrapIfFunction(args[1]), ...args.slice(2)
                    ]);
                };
            });
            // tslint:enable:no-any
        }
    }];
module.exports = plugin;
//# sourceMappingURL=plugin-bluebird.js.map