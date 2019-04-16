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
const path = require("path");
const cls_1 = require("./cls");
const logger_1 = require("./logger");
const trace_plugin_loader_1 = require("./trace-plugin-loader");
const trace_writer_1 = require("./trace-writer");
const util_1 = require("./util");
/**
 * A class that represents automatic tracing.
 */
class Tracing {
    /**
     * Constructs a new Tracing instance.
     * @param config The configuration for this instance.
     * @param traceAgent An object representing the custom tracing API.
     */
    constructor(config, traceAgent) {
        this.traceAgent = traceAgent;
        this.config = config;
        let logLevel = config.enabled ? config.logLevel : 0;
        // Clamp the logger level.
        const defaultLevels = logger_1.LEVELS;
        if (logLevel < 0) {
            logLevel = 0;
        }
        else if (logLevel >= defaultLevels.length) {
            logLevel = defaultLevels.length - 1;
        }
        this.logger = new logger_1.Logger({ level: defaultLevels[logLevel], tag: '@google-cloud/trace-agent' });
    }
    /**
     * Logs an error message detailing the list of modules that were loaded before
     * the Trace Agent. Loading these modules before the Trace Agent may prevent
     * us from monkeypatching those modules for automatic tracing.
     * @param filesLoadedBeforeTrace The list of files that were loaded using
     * require() before the Stackdriver Trace Agent was required.
     */
    logModulesLoadedBeforeTrace(filesLoadedBeforeTrace) {
        const modulesLoadedBeforeTrace = [];
        const traceModuleName = path.join('@google-cloud', 'trace-agent');
        for (let i = 0; i < filesLoadedBeforeTrace.length; i++) {
            const moduleName = util_1.packageNameFromPath(filesLoadedBeforeTrace[i]);
            if (moduleName && moduleName !== traceModuleName &&
                modulesLoadedBeforeTrace.indexOf(moduleName) === -1) {
                modulesLoadedBeforeTrace.push(moduleName);
            }
        }
        if (modulesLoadedBeforeTrace.length > 0) {
            this.logger.error('StackdriverTracer#start: Tracing might not work as the following modules', 'were loaded before the trace agent was initialized:', `[${modulesLoadedBeforeTrace.sort().join(', ')}]`);
        }
    }
    /**
     * Enables automatic tracing support and the custom span API.
     */
    enable() {
        if (!this.config.enabled) {
            return;
        }
        // Initialize context propagation mechanism configuration.
        const clsConfig = {
            mechanism: this.config.clsMechanism,
            [util_1.FORCE_NEW]: this.config[util_1.FORCE_NEW]
        };
        try {
            trace_writer_1.traceWriter.create(this.config, this.logger);
            cls_1.cls.create(clsConfig, this.logger);
        }
        catch (e) {
            this.logger.error('StackdriverTracer#start: Disabling the Trace Agent for the', `following reason: ${e.message}`);
            this.disable();
            return;
        }
        trace_writer_1.traceWriter.get().initialize().catch((err) => {
            this.logger.error('StackdriverTracer#start: Disabling the Trace Agent for the', `following reason: ${err.message}`);
            this.disable();
        });
        cls_1.cls.get().enable();
        this.traceAgent.enable(this.config, this.logger);
        trace_plugin_loader_1.pluginLoader.create(this.config, this.logger).activate();
        if (typeof this.config.projectId !== 'string' &&
            typeof this.config.projectId !== 'undefined') {
            this.logger.error('StackdriverTracer#start: config.projectId, if provided, must be a string.', 'Disabling trace agent.');
            this.disable();
            return;
        }
        // Make trace agent available globally without requiring package
        global._google_trace_agent = this.traceAgent;
        this.logger.info('StackdriverTracer#start: Trace Agent activated.');
    }
    /**
     * Disables automatic tracing support. This disables the publicly exposed
     * custom span API, as well as any instances passed to plugins. This also
     * prevents the Trace Writer from publishing additional traces.
     */
    disable() {
        if (trace_plugin_loader_1.pluginLoader.exists()) {
            trace_plugin_loader_1.pluginLoader.get().deactivate();
        }
        if (this.traceAgent.isActive()) {
            this.traceAgent.disable();
        }
        if (cls_1.cls.exists()) {
            cls_1.cls.get().disable();
        }
        if (trace_writer_1.traceWriter.exists()) {
            trace_writer_1.traceWriter.get().stop();
        }
    }
}
exports.Tracing = Tracing;
exports.tracing = new util_1.Singleton(Tracing);
//# sourceMappingURL=tracing.js.map