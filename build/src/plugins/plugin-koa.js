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
const shimmer = require("shimmer");
const url_1 = require("url");
function getFirstHeader(req, key) {
    let headerValue = req.headers[key] || null;
    if (headerValue && typeof headerValue !== 'string') {
        headerValue = headerValue[0];
    }
    return headerValue;
}
function startSpanForRequest(api, ctx, getNext) {
    const req = ctx.req;
    const res = ctx.res;
    const originalEnd = res.end;
    const options = {
        name: req.url ? (url_1.parse(req.url).pathname || '') : '',
        url: req.url,
        method: req.method,
        traceContext: getFirstHeader(req, api.constants.TRACE_CONTEXT_HEADER_NAME),
        skipFrames: 2
    };
    return api.runInRootSpan(options, root => {
        // Set response trace context.
        const responseTraceContext = api.getResponseTraceContext(options.traceContext || null, api.isRealSpan(root));
        if (responseTraceContext) {
            res.setHeader(api.constants.TRACE_CONTEXT_HEADER_NAME, responseTraceContext);
        }
        if (!api.isRealSpan(root)) {
            return getNext(false);
        }
        api.wrapEmitter(req);
        api.wrapEmitter(res);
        const url = `${req.headers['X-Forwarded-Proto'] || 'http'}://${req.headers.host}${req.url}`;
        // we use the path part of the url as the span name and add the full
        // url as a label
        // req.path would be more desirable but is not set at the time our
        // middlewear runs.
        root.addLabel(api.labels.HTTP_METHOD_LABEL_KEY, req.method);
        root.addLabel(api.labels.HTTP_URL_LABEL_KEY, url);
        root.addLabel(api.labels.HTTP_SOURCE_IP, ctx.request.ip);
        // wrap end
        res.end = function () {
            res.end = originalEnd;
            const returned = res.end.apply(this, arguments);
            if (ctx.routePath) {
                root.addLabel('koa/request.route.path', ctx.routePath);
            }
            root.addLabel(api.labels.HTTP_RESPONSE_CODE_LABEL_KEY, res.statusCode);
            root.endSpan();
            return returned;
        };
        // if the event is aborted, end the span (as res.end will not be called)
        req.once('aborted', () => {
            root.addLabel(api.labels.ERROR_DETAILS_NAME, 'aborted');
            root.addLabel(api.labels.ERROR_DETAILS_MESSAGE, 'client aborted the request');
            root.endSpan();
        });
        return getNext(true);
    });
}
function createMiddleware(api) {
    return function* middleware(next) {
        next = startSpanForRequest(api, this, (propagateContext) => {
            if (propagateContext) {
                next.next = api.wrap(next.next);
            }
            return next;
        });
        yield next;
    };
}
function createMiddleware2x(api) {
    return function middleware(ctx, next) {
        next = startSpanForRequest(api, ctx, (propagateContext) => propagateContext ? api.wrap(next) : next);
        return next();
    };
}
function patchUse(koa, api, createMiddlewareFunction) {
    shimmer.wrap(koa.prototype, 'use', (use) => {
        return function useTrace() {
            if (!this._google_trace_patched) {
                this._google_trace_patched = true;
                this.use(createMiddlewareFunction(api));
            }
            return use.apply(this, arguments);
        };
    });
}
const plugin = [
    {
        file: '',
        versions: '1.x',
        patch: (koa, api) => {
            patchUse(koa, api, createMiddleware);
        },
        unpatch: (koa) => {
            shimmer.unwrap(koa.prototype, 'use');
        }
    },
    {
        file: '',
        versions: '2.x',
        patch: (koa, api) => {
            patchUse(koa, api, createMiddleware2x);
        },
        unpatch: (koa) => {
            shimmer.unwrap(koa.prototype, 'use');
        }
    }
];
module.exports = plugin;
//# sourceMappingURL=plugin-koa.js.map