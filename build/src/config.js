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
const path = require("path");
const pluginDirectory = path.join(path.resolve(__dirname, '..'), 'src', 'plugins');
/**
 * Default configuration. For fields with primitive values, any user-provided
 * value will override the corresponding default value.
 * For fields with non-primitive values (plugins and serviceContext), the
 * user-provided value will be used to extend the default value.
 */
exports.defaultConfig = {
    logLevel: 1,
    enabled: true,
    enhancedDatabaseReporting: false,
    rootSpanNameOverride: (name) => name,
    clsMechanism: 'auto',
    spansPerTraceSoftLimit: 200,
    spansPerTraceHardLimit: 1000,
    maximumLabelValueSize: 512,
    plugins: {
        // enable all by default
        'bluebird': path.join(pluginDirectory, 'plugin-bluebird.js'),
        'connect': path.join(pluginDirectory, 'plugin-connect.js'),
        'express': path.join(pluginDirectory, 'plugin-express.js'),
        'generic-pool': path.join(pluginDirectory, 'plugin-generic-pool.js'),
        'grpc': path.join(pluginDirectory, 'plugin-grpc.js'),
        'hapi': path.join(pluginDirectory, 'plugin-hapi.js'),
        'http': path.join(pluginDirectory, 'plugin-http.js'),
        'http2': path.join(pluginDirectory, 'plugin-http2.js'),
        'koa': path.join(pluginDirectory, 'plugin-koa.js'),
        'mongodb-core': path.join(pluginDirectory, 'plugin-mongodb-core.js'),
        'mongoose': path.join(pluginDirectory, 'plugin-mongoose.js'),
        'mysql': path.join(pluginDirectory, 'plugin-mysql.js'),
        'mysql2': path.join(pluginDirectory, 'plugin-mysql2.js'),
        'pg': path.join(pluginDirectory, 'plugin-pg.js'),
        'redis': path.join(pluginDirectory, 'plugin-redis.js'),
        'restify': path.join(pluginDirectory, 'plugin-restify.js')
    },
    stackTraceLimit: 10,
    flushDelaySeconds: 30,
    ignoreUrls: ['/_ah/health'],
    ignoreMethods: [],
    samplingRate: 10,
    contextHeaderBehavior: 'default',
    bufferSize: 1000,
    onUncaughtException: 'ignore',
    serviceContext: {}
};
//# sourceMappingURL=config.js.map