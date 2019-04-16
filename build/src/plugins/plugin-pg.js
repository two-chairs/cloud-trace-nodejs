"use strict";
/**
 * Copyright 2017 Google Inc. All Rights Reserved.
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
const events_1 = require("events");
const shimmer = require("shimmer");
const noOp = () => { };
function populateLabelsFromInputs(span, args) {
    const queryObj = args[0];
    if (typeof queryObj === 'object') {
        if (queryObj.text) {
            span.addLabel('query', queryObj.text);
        }
        if (queryObj.values) {
            span.addLabel('values', queryObj.values);
        }
    }
    else if (typeof queryObj === 'string') {
        span.addLabel('query', queryObj);
        if (args.length >= 2 && typeof args[1] !== 'function') {
            span.addLabel('values', args[1]);
        }
    }
}
function populateLabelsFromOutputs(span, err, res) {
    if (err) {
        span.addLabel('error', err);
    }
    if (res) {
        span.addLabel('row_count', res.rowCount);
        span.addLabel('oid', res.oid);
        span.addLabel('rows', res.rows);
        span.addLabel('fields', res.fields);
    }
}
/**
 * Utility class to help organize patching logic.
 */
class PostgresPatchUtility {
    constructor(tracer) {
        this.tracer = tracer;
        this.maybePopulateLabelsFromInputs =
            tracer.enhancedDatabaseReportingEnabled() ? populateLabelsFromInputs :
                noOp;
        this.maybePopulateLabelsFromOutputs =
            tracer.enhancedDatabaseReportingEnabled() ? populateLabelsFromOutputs :
                noOp;
    }
    patchSubmittable(pgQuery, span) {
        let spanEnded = false;
        const { maybePopulateLabelsFromOutputs } = this;
        if (pgQuery.handleError) {
            shimmer.wrap(pgQuery, 'handleError', (origCallback) => {
                // Elements of args are not individually accessed.
                // tslint:disable:no-any
                return this.tracer.wrap(function (...args) {
                    // tslint:enable:no-any
                    if (!spanEnded) {
                        const err = args[0];
                        maybePopulateLabelsFromOutputs(span, err);
                        span.endSpan();
                        spanEnded = true;
                    }
                    if (origCallback) {
                        origCallback.apply(this, args);
                    }
                });
            });
        }
        if (pgQuery.handleReadyForQuery) {
            shimmer.wrap(pgQuery, 'handleReadyForQuery', (origCallback) => {
                // Elements of args are not individually accessed.
                // tslint:disable:no-any
                return this.tracer.wrap(function (...args) {
                    // tslint:enable:no-any
                    if (!spanEnded) {
                        maybePopulateLabelsFromOutputs(span, null, this._result);
                        span.endSpan();
                        spanEnded = true;
                    }
                    if (origCallback) {
                        origCallback.apply(this, args);
                    }
                });
            });
        }
        return pgQuery;
    }
    patchCallback(callback, span) {
        return this.tracer.wrap((err, res) => {
            this.maybePopulateLabelsFromOutputs(span, err, res);
            span.endSpan();
            callback(err, res);
        });
    }
    patchPromise(promise, span) {
        return promise = promise.then((res) => {
            this.maybePopulateLabelsFromOutputs(span, null, res);
            span.endSpan();
            return res;
        }, (err) => {
            this.maybePopulateLabelsFromOutputs(span, err);
            span.endSpan();
            throw err;
        });
    }
}
const plugin = [
    {
        file: 'lib/client.js',
        versions: '^6.x',
        // TS: Client is a class name.
        // tslint:disable-next-line:variable-name
        patch: (Client, api) => {
            const pgPatch = new PostgresPatchUtility(api);
            shimmer.wrap(Client.prototype, 'query', (query) => {
                // Every call to Client#query will have a Submittable object associated
                // with it. We need to patch two handlers (handleReadyForQuery and
                // handleError) to end a span.
                // There are a few things to note here:
                // * query accepts a Submittable or a string. A Query is a Submittable.
                //   So if we can get a Submittable from the input we patch it
                //   proactively, otherwise (in the case of a string) we patch the
                //   output Query instead.
                // * If query is passed a callback, the callback will be invoked from
                //   either handleReadyForQuery or handleError. So we don't need to
                //   separately patch the callback.
                return function query_trace(...args) {
                    if (args.length >= 1) {
                        const span = api.createChildSpan({ name: 'pg-query' });
                        if (!api.isRealSpan(span)) {
                            return query.apply(this, args);
                        }
                        // Extract query text and values, if needed.
                        pgPatch.maybePopulateLabelsFromInputs(span, args);
                        if (typeof args[0] === 'object') {
                            pgPatch.patchSubmittable(args[0], span);
                            return query.apply(this, args);
                        }
                        else {
                            return pgPatch.patchSubmittable(query.apply(this, args), span);
                        }
                    }
                    else {
                        // query was called with no arguments.
                        // This doesn't make sense, but don't do anything that might cause
                        // an error to get thrown here, or a span to be started.
                        return query.apply(this, args);
                    }
                };
            });
        },
        // TS: Client is a class name.
        // tslint:disable-next-line:variable-name
        unpatch(Client) {
            shimmer.unwrap(Client.prototype, 'query');
        }
    },
    {
        file: 'lib/client.js',
        versions: '^7.x',
        // TS: Client is a class name.
        // tslint:disable-next-line:variable-name
        patch: (Client, api) => {
            const pgPatch = new PostgresPatchUtility(api);
            shimmer.wrap(Client.prototype, 'query', (query) => {
                return function query_trace() {
                    const span = api.createChildSpan({ name: 'pg-query' });
                    if (!api.isRealSpan(span)) {
                        return query.apply(this, arguments);
                    }
                    let pgQuery;
                    // In 7.x, the value of pgQuery depends on how the query() was called.
                    // It can be one of:
                    // - (query: pg.Submittable) => EventEmitter
                    //   - Note: return value is the same as the argument.
                    // - ([*], callback: (err, res: pg.Result) => void) => void
                    // - ([*]) => Promise<pg.Result>
                    // where [*] is one of:
                    // - ...[query: { text: string, values?: Array<any> }]
                    // - ...[text: string, values?: Array<any>]
                    // See: https://node-postgres.com/guides/upgrading
                    const argLength = arguments.length;
                    if (argLength >= 1) {
                        const args = Array.prototype.slice.call(arguments, 0);
                        // Extract query text and values, if needed.
                        pgPatch.maybePopulateLabelsFromInputs(span, args);
                        // If we received a callback, bind it to the current context,
                        // optionally adding labels as well.
                        const callback = args[args.length - 1];
                        if (typeof callback === 'function') {
                            args[args.length - 1] = pgPatch.patchCallback(callback, span);
                        }
                        else if (typeof args[0] === 'object') {
                            pgPatch.patchSubmittable(args[0], span);
                        }
                        pgQuery = query.apply(this, args);
                    }
                    else {
                        pgQuery = query.apply(this, arguments);
                    }
                    if (pgQuery) {
                        if (pgQuery instanceof events_1.EventEmitter) {
                            api.wrapEmitter(pgQuery);
                        }
                        else if (typeof pgQuery.then === 'function') {
                            // Unlike in pg 6, the returned value can't be both a Promise and
                            // a Submittable. So we don't run the risk of double-patching
                            // here.
                            pgPatch.patchPromise(pgQuery, span);
                        }
                    }
                    return pgQuery;
                };
            });
        },
        // TS: Client is a class name.
        // tslint:disable-next-line:variable-name
        unpatch(Client) {
            shimmer.unwrap(Client.prototype, 'query');
        }
    }
];
module.exports = plugin;
//# sourceMappingURL=plugin-pg.js.map