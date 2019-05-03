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
const semver = require("semver");
const async_hooks_1 = require("./cls/async-hooks");
const async_listener_1 = require("./cls/async-listener");
const null_1 = require("./cls/null");
const singular_1 = require("./cls/singular");
const span_data_1 = require("./span-data");
const util_1 = require("./util");
const asyncHooksAvailable = semver.satisfies(process.version, '>=8');
/**
 * An enumeration of the possible mechanisms for supporting context propagation
 * through continuation-local storage.
 */
var TraceCLSMechanism;
(function (TraceCLSMechanism) {
    /**
     * Use the AsyncHooksCLS class to propagate root span context.
     * Only available in Node 8+.
     */
    TraceCLSMechanism["ASYNC_HOOKS"] = "async-hooks";
    /**
     * Use the AsyncListenerCLS class to propagate root span context.
     * Note that continuation-local-storage should be loaded as the first module.
     */
    TraceCLSMechanism["ASYNC_LISTENER"] = "async-listener";
    /**
     * Do not use any special mechanism to propagate root span context.
     * Only a single root span can be open at a time.
     */
    TraceCLSMechanism["SINGULAR"] = "singular";
    /**
     * Do not write root span context; in other words, querying the current root
     * span context will always result in a default value.
     */
    TraceCLSMechanism["NONE"] = "none";
})(TraceCLSMechanism = exports.TraceCLSMechanism || (exports.TraceCLSMechanism = {}));
/**
 * An implementation of continuation-local storage for the Trace Agent.
 * In addition to the underlying API, there is a guarantee that when an instance
 * of this class is disabled, all context-manipulation methods will either be
 * no-ops or pass-throughs.
 */
class TraceCLS {
    constructor(config, logger) {
        this.logger = logger;
        this.enabled = false;
        switch (config.mechanism) {
            case TraceCLSMechanism.ASYNC_HOOKS:
                if (!asyncHooksAvailable) {
                    throw new Error(`CLS mechanism [${config.mechanism}] is not compatible with Node <8.`);
                }
                this.CLSClass = async_hooks_1.AsyncHooksCLS;
                this.rootSpanStackOffset = 4;
                break;
            case TraceCLSMechanism.ASYNC_LISTENER:
                this.CLSClass = async_listener_1.AsyncListenerCLS;
                this.rootSpanStackOffset = 8;
                break;
            case TraceCLSMechanism.SINGULAR:
                this.CLSClass = singular_1.SingularCLS;
                this.rootSpanStackOffset = 4;
                break;
            case TraceCLSMechanism.NONE:
                this.CLSClass = null_1.NullCLS;
                this.rootSpanStackOffset = 4;
                break;
            default:
                throw new Error(`CLS mechanism [${config.mechanism}] was not recognized.`);
        }
        this.logger.info(`TraceCLS#constructor: Created [${config.mechanism}] CLS instance.`);
        this.currentCLS = new null_1.NullCLS(TraceCLS.UNTRACED);
        this.currentCLS.enable();
    }
    isEnabled() {
        return this.enabled;
    }
    enable() {
        // if this.CLSClass = NullCLS, the user specifically asked not to use
        // any context propagation mechanism. So nothing should change.
        if (!this.enabled && this.CLSClass !== null_1.NullCLS) {
            this.logger.info('TraceCLS#enable: Enabling CLS.');
            this.currentCLS.disable();
            this.currentCLS = new this.CLSClass(TraceCLS.UNCORRELATED);
            this.currentCLS.enable();
        }
        this.enabled = true;
    }
    disable() {
        if (this.enabled && this.CLSClass !== null_1.NullCLS) {
            this.logger.info('TraceCLS#disable: Disabling CLS.');
            this.currentCLS.disable();
            this.currentCLS = new null_1.NullCLS(TraceCLS.UNTRACED);
            this.currentCLS.enable();
        }
        this.enabled = false;
    }
    getContext() {
        return this.currentCLS.getContext();
    }
    runWithContext(fn, value) {
        return this.currentCLS.runWithContext(fn, value);
    }
    bindWithCurrentContext(fn) {
        return this.currentCLS.bindWithCurrentContext(fn);
    }
    patchEmitterToPropagateContext(ee) {
        this.currentCLS.patchEmitterToPropagateContext(ee);
    }
}
TraceCLS.UNCORRELATED = span_data_1.UNCORRELATED_ROOT_SPAN;
TraceCLS.UNTRACED = span_data_1.UNTRACED_ROOT_SPAN;
exports.TraceCLS = TraceCLS;
exports.cls = new util_1.Singleton(TraceCLS);
//# sourceMappingURL=cls.js.map