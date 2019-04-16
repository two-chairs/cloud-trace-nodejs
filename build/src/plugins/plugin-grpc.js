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
const shimmer = require("shimmer");
const SKIP_FRAMES = 1;
// Required for adding distributed tracing metadata to outgoing gRPC requests.
// This value is assigned in patchMetadata, and used in patchClient.
// patchMetadata is guaranteed to be called before patchClient because Client
// depends on Metadata.
// TODO(kjin): This could cause bugs if there are multiple gRPC modules being
// used at once.
// tslint:disable-next-line:variable-name
let MetadataModuleValue;
function patchMetadata(metadata, api) {
    // metadata is the value of module.exports of src/node/src/metadata.js
    MetadataModuleValue = metadata;
}
function unpatchMetadata() {
    // patchMetadata doesn't modify the module exports of metadata.js.
    // So it's safe to provide a no-op unpatch function.
}
function patchClient(client, api) {
    /**
     * Set trace context on a Metadata object if it exists.
     * @param metadata The Metadata object to which a trace context should be
     * added.
     * @param stringifiedTraceContext The stringified trace context. If this is
     * a falsey value, metadata will not be modified.
     */
    function setTraceContextFromString(metadata, stringifiedTraceContext) {
        const traceContext = api.traceContextUtils.decodeFromString(stringifiedTraceContext);
        if (traceContext) {
            const metadataValue = api.traceContextUtils.encodeAsByteArray(traceContext);
            metadata.set(api.constants.TRACE_CONTEXT_GRPC_METADATA_NAME, metadataValue);
        }
    }
    /**
     * Wraps a callback so that the current span for this trace is also ended when
     * the callback is invoked.
     * @param span - The span that should end after this callback.
     * @param done - The callback to be wrapped.
     */
    function wrapCallback(span, done) {
        const fn = (err, res) => {
            if (api.enhancedDatabaseReportingEnabled()) {
                if (err) {
                    span.addLabel('error', err);
                }
                if (res) {
                    span.addLabel('result', JSON.stringify(res));
                }
            }
            span.endSpan();
            done(err, res);
        };
        return api.wrap(fn);
    }
    /**
     * This function is passed to shimmer.wrap in makeClientConstructorWrap below.
     * It starts a child span immediately before the client method is invoked,
     * and ends it either in a callback or stream event handler, depending on the
     * method type.
     */
    function makeClientMethod(method) {
        // TODO(kjin): When we upgrade to TypeScript 2.8, make the return type
        // ReturnType<ClientMethod<S, T>>
        function clientMethodTrace() {
            // The span name will be of form "grpc:/[Service]/[MethodName]".
            const span = api.createChildSpan({ name: 'grpc:' + method.path });
            if (!api.isRealSpan(span)) {
                // Span couldn't be created, either by policy or because a root span
                // doesn't exist.
                return method.apply(this, arguments);
            }
            const args = Array.prototype.slice.call(arguments);
            // Check if the response is through a stream or a callback.
            if (!method.responseStream) {
                // We need to wrap the callback with the context, to propagate it.
                // The callback is always required. It should be the only function in
                // the arguments, since we cannot send a function as an argument through
                // gRPC.
                const cbIndex = args.findIndex((arg) => {
                    return typeof arg === 'function';
                });
                if (cbIndex !== -1) {
                    args[cbIndex] = wrapCallback(span, args[cbIndex]);
                }
            }
            // This finds an instance of Metadata among the arguments.
            // A possible issue that could occur is if the 'options' parameter from
            // the user contains an '_internal_repr' as well as a 'getMap' function,
            // but this is an extremely rare case.
            let metaIndex = args.findIndex((arg) => {
                return !!arg && typeof arg === 'object' && arg._internal_repr &&
                    typeof arg.getMap === 'function';
            });
            if (metaIndex === -1) {
                const metadata = new MetadataModuleValue();
                if (!method.requestStream) {
                    // unary or server stream
                    if (args.length === 0) {
                        // No argument (for the gRPC call) was provided, so we will have to
                        // provide one, since metadata cannot be the first argument.
                        // The internal representation of argument defaults to undefined
                        // in its non-presence.
                        // Note that we can't pass null instead of undefined because the
                        // serializer within gRPC doesn't accept it.
                        args.push(undefined);
                    }
                    metaIndex = 1;
                }
                else {
                    // client stream or bidi
                    metaIndex = 0;
                }
                args.splice(metaIndex, 0, metadata);
            }
            // TS: Safe cast as we either found the index of the Metadata argument
            //     or spliced it in at metaIndex.
            const metadata = args[metaIndex];
            setTraceContextFromString(metadata, span.getTraceContext());
            const call = method.apply(this, args);
            // Add extra data only when call successfully goes through. At this point
            // we know that the arguments are correct.
            if (api.enhancedDatabaseReportingEnabled()) {
                span.addLabel('metadata', JSON.stringify(metadata.getMap()));
                if (!method.requestStream) {
                    span.addLabel('argument', JSON.stringify(args[0]));
                }
            }
            // The user might need the current context in listeners to this stream.
            api.wrapEmitter(call);
            if (method.responseStream) {
                let spanEnded = false;
                call.on('error', (err) => {
                    if (api.enhancedDatabaseReportingEnabled()) {
                        span.addLabel('error', err);
                    }
                    if (!spanEnded) {
                        span.endSpan();
                        spanEnded = true;
                    }
                });
                call.on('status', (status) => {
                    if (api.enhancedDatabaseReportingEnabled()) {
                        span.addLabel('status', JSON.stringify(status));
                    }
                    if (!spanEnded) {
                        span.endSpan();
                        spanEnded = true;
                    }
                });
            }
            return call;
        }
        // TODO(kjin): Investigate whether we need to copy properties of
        // method onto clientMethodTrace.
        // tslint:disable-next-line:no-any
        return clientMethodTrace;
    }
    /**
     * Modifies `makeClientConstructor` so that all of the methods available
     * through the client are wrapped upon calling the client object constructor.
     */
    function makeClientConstructorWrap(makeClientConstructor) {
        return function makeClientConstructorTrace(methods) {
            // Client is a class.
            // tslint:disable-next-line:variable-name
            const Client = makeClientConstructor.apply(this, arguments);
            const methodsToWrap = [
                ...Object.keys(methods),
                ...Object.keys(methods)
                    .map(methodName => methods[methodName].originalName)
                    .filter(originalName => !!originalName &&
                    Client.prototype.hasOwnProperty(originalName))
            ];
            shimmer.massWrap([Client.prototype], methodsToWrap, makeClientMethod);
            return Client;
        };
    }
    shimmer.wrap(client, 'makeClientConstructor', makeClientConstructorWrap);
}
function unpatchClient(client) {
    // Only the Client constructor is unwrapped, so that future grpc.load's
    // will not wrap Client methods with tracing. However, existing Client
    // objects with wrapped prototype methods will continue tracing.
    shimmer.unwrap(client, 'makeClientConstructor');
}
function patchServer(server, api) {
    /**
     * Returns a trace context on a Metadata object if it exists and is
     * well-formed, or null otherwise. The result will be encoded as a string.
     * @param metadata The Metadata object from which trace context should be
     * retrieved.
     */
    function getStringifiedTraceContext(metadata) {
        const metadataValue = metadata.getMap()[api.constants.TRACE_CONTEXT_GRPC_METADATA_NAME];
        // Entry doesn't exist.
        if (!metadataValue) {
            return null;
        }
        const traceContext = api.traceContextUtils.decodeFromByteArray(metadataValue);
        // Value is malformed.
        if (!traceContext) {
            return null;
        }
        return api.traceContextUtils.encodeAsString(traceContext);
    }
    /**
     * A helper function to record metadata in a trace span. The return value of
     * this function can be used as the 'wrapper' argument to wrap sendMetadata.
     * sendMetadata is a member of each of ServerUnaryCall, ServerWriteableStream,
     * ServerReadableStream, and ServerDuplexStream.
     * @param rootSpan The span object to which the metadata should be added.
     * @returns A function that returns a wrapped form of sendMetadata.
     */
    function sendMetadataWrapper(rootSpan) {
        return (sendMetadata) => {
            return function sendMetadataTrace(responseMetadata) {
                rootSpan.addLabel('metadata', JSON.stringify(responseMetadata.getMap()));
                return sendMetadata.apply(this, arguments);
            };
        };
    }
    /**
     * Wraps a unary function in order to record trace spans.
     * @param handlerSet An object containing references to the function
     * handle.
     * @param requestName The human-friendly name of the request.
     */
    function wrapUnary(handlerSet, requestName) {
        // handlerSet.func is the gRPC method implementation itself.
        // We wrap it so that a span is started immediately beforehand, and ended
        // when the callback provided to it as an argument is invoked.
        // TODO(kjin): shimmer cannot wrap AsyncFunction objects.
        // Once shimmer introduces this functionality, change this code to use it
        // here, and in other server wrap* methods.
        // See also https://github.com/othiym23/shimmer/pull/14.
        const serverMethod = handlerSet.func;
        handlerSet.func = function serverMethodTrace(call, callback) {
            const rootSpanOptions = {
                name: requestName,
                url: requestName,
                traceContext: getStringifiedTraceContext(call.metadata),
                skipFrames: SKIP_FRAMES
            };
            return api.runInRootSpan(rootSpanOptions, (rootSpan) => {
                if (!api.isRealSpan(rootSpan)) {
                    return serverMethod.call(this, call, callback);
                }
                if (api.enhancedDatabaseReportingEnabled()) {
                    shimmer.wrap(call, 'sendMetadata', sendMetadataWrapper(rootSpan));
                    rootSpan.addLabel('argument', JSON.stringify(call.request));
                }
                rootSpan.addLabel(api.labels.HTTP_METHOD_LABEL_KEY, 'POST');
                // Here, we patch the callback so that the span is ended immediately
                // beforehand.
                const wrappedCb = (err, result, trailer, flags) => {
                    if (api.enhancedDatabaseReportingEnabled()) {
                        if (err) {
                            rootSpan.addLabel('error', err);
                        }
                        else {
                            rootSpan.addLabel('result', JSON.stringify(result));
                        }
                        if (trailer) {
                            rootSpan.addLabel('trailing_metadata', JSON.stringify(trailer.getMap()));
                        }
                    }
                    rootSpan.endSpan();
                    return callback(err, result, trailer, flags);
                };
                return serverMethod.call(this, call, wrappedCb);
            });
        };
    }
    /**
     * Wraps a server streaming function in order to record trace spans.
     * @param handlerSet An object containing references to the function
     * handle.
     * @param requestName The human-friendly name of the request.
     */
    function wrapServerStream(handlerSet, requestName) {
        // handlerSet.func is the gRPC method implementation itself.
        // We wrap it so that a span is started immediately beforehand, and ended
        // when there is no data to be sent from the server.
        const serverMethod = handlerSet.func;
        handlerSet.func = function serverMethodTrace(stream) {
            // TODO(kjin): Is it possible for a metadata value to be a buffer?
            const rootSpanOptions = {
                name: requestName,
                url: requestName,
                traceContext: getStringifiedTraceContext(stream.metadata),
                skipFrames: SKIP_FRAMES
            };
            return api.runInRootSpan(rootSpanOptions, (rootSpan) => {
                if (!api.isRealSpan(rootSpan)) {
                    return serverMethod.call(this, stream);
                }
                if (api.enhancedDatabaseReportingEnabled()) {
                    shimmer.wrap(stream, 'sendMetadata', sendMetadataWrapper(rootSpan));
                    rootSpan.addLabel('argument', JSON.stringify(stream.request));
                }
                rootSpan.addLabel(api.labels.HTTP_METHOD_LABEL_KEY, 'POST');
                let spanEnded = false;
                const endSpan = () => {
                    if (!spanEnded) {
                        spanEnded = true;
                        rootSpan.endSpan();
                    }
                };
                // Propagate context to stream event handlers.
                api.wrapEmitter(stream);
                // stream is a WriteableStream. Emitting a 'finish' or 'error' event
                // suggests that no more data will be sent, so we end the span in
                // these event handlers.
                stream.on('finish', () => {
                    // End the span unless there is an error. (If there is, the span
                    // will be ended in the error event handler. This is to ensure that
                    // the 'error' label is applied.)
                    if (stream.status.code === 0) {
                        endSpan();
                    }
                });
                stream.on('error', (err) => {
                    if (api.enhancedDatabaseReportingEnabled()) {
                        rootSpan.addLabel('error', err);
                    }
                    endSpan();
                });
                return serverMethod.call(this, stream);
            });
        };
    }
    /**
     * Wraps a client streaming function in order to record trace spans.
     * @param handlerSet An object containing references to the function
     * handle.
     * @param requestName The human-friendly name of the request.
     */
    function wrapClientStream(handlerSet, requestName) {
        // handlerSet.func is the gRPC method implementation itself.
        // We wrap it so that a span is started immediately beforehand, and ended
        // when the callback provided to it as an argument is invoked.
        const serverMethod = handlerSet.func;
        handlerSet.func = function serverMethodTrace(stream, callback) {
            const rootSpanOptions = {
                name: requestName,
                url: requestName,
                traceContext: getStringifiedTraceContext(stream.metadata),
                skipFrames: SKIP_FRAMES
            };
            return api.runInRootSpan(rootSpanOptions, (rootSpan) => {
                if (!api.isRealSpan(rootSpan)) {
                    return serverMethod.call(this, stream, callback);
                }
                if (api.enhancedDatabaseReportingEnabled()) {
                    shimmer.wrap(stream, 'sendMetadata', sendMetadataWrapper(rootSpan));
                }
                rootSpan.addLabel(api.labels.HTTP_METHOD_LABEL_KEY, 'POST');
                // Propagate context to stream event handlers.
                // stream is a ReadableStream.
                // Note that unlike server streams, the length of the span is not
                // tied to the lifetime of the stream. It should measure the time for
                // the server to send a response, not the time until all data has been
                // received from the client.
                api.wrapEmitter(stream);
                // Here, we patch the callback so that the span is ended immediately
                // beforehand.
                const wrappedCb = (err, result, trailer, flags) => {
                    if (api.enhancedDatabaseReportingEnabled()) {
                        if (err) {
                            rootSpan.addLabel('error', err);
                        }
                        else {
                            rootSpan.addLabel('result', JSON.stringify(result));
                        }
                        if (trailer) {
                            rootSpan.addLabel('trailing_metadata', JSON.stringify(trailer.getMap()));
                        }
                    }
                    rootSpan.endSpan();
                    return callback(err, result, trailer, flags);
                };
                return serverMethod.call(this, stream, wrappedCb);
            });
        };
    }
    /**
     * Wraps a bidirectional streaming function in order to record trace spans.
     * @param handlerSet An object containing references to the function
     * handle.
     * @param requestName The human-friendly name of the request.
     */
    function wrapBidi(handlerSet, requestName) {
        // handlerSet.func is the gRPC method implementation itself.
        // We wrap it so that a span is started immediately beforehand, and ended
        // when there is no data to be sent from the server.
        const serverMethod = handlerSet.func;
        handlerSet.func = function serverMethodTrace(stream) {
            const rootSpanOptions = {
                name: requestName,
                url: requestName,
                traceContext: getStringifiedTraceContext(stream.metadata),
                skipFrames: SKIP_FRAMES
            };
            return api.runInRootSpan(rootSpanOptions, (rootSpan) => {
                if (!api.isRealSpan(rootSpan)) {
                    return serverMethod.call(this, stream);
                }
                if (api.enhancedDatabaseReportingEnabled()) {
                    shimmer.wrap(stream, 'sendMetadata', sendMetadataWrapper(rootSpan));
                }
                rootSpan.addLabel(api.labels.HTTP_METHOD_LABEL_KEY, 'POST');
                let spanEnded = false;
                const endSpan = () => {
                    if (!spanEnded) {
                        spanEnded = true;
                        rootSpan.endSpan();
                    }
                };
                // Propagate context in stream event handlers.
                api.wrapEmitter(stream);
                // stream is a Duplex. Emitting a 'finish' or 'error' event
                // suggests that no more data will be sent, so we end the span in
                // these event handlers.
                // Similar to client streams, the trace span should measure the time
                // until the server has finished sending data back to the client, not
                // the time that all data has been received from the client.
                stream.on('finish', () => {
                    // End the span unless there is an error.
                    if (stream.status.code === 0) {
                        endSpan();
                    }
                });
                stream.on('error', (err) => {
                    if (!spanEnded && api.enhancedDatabaseReportingEnabled()) {
                        rootSpan.addLabel('error', err);
                    }
                    endSpan();
                });
                return serverMethod.call(this, stream);
            });
        };
    }
    /**
     * Returns a function that wraps the gRPC server register function in order
     * to create trace spans for gRPC service methods.
     * @param register The function Server.prototype.register
     * @returns registerTrace The new wrapper function.
     */
    function serverRegisterWrap(register) {
        return function registerTrace(name, handler, serialize, deserialize, methodType) {
            // register(n, h, s, d, m) is called in addService once for each service
            // method. Its role is to assign the serialize, deserialize, and user
            // logic handlers for each exposed service method. Here, we wrap these
            // functions depending on the method type.
            const result = register.apply(this, arguments);
            const handlerSet = this.handlers[name];
            const requestName = 'grpc:' + name;
            // Proceed to wrap methods that are invoked when a gRPC service call is
            // made. In every case, the function 'func' is the user-implemented
            // handling function.
            switch (methodType) {
                case 'unary':
                    wrapUnary(handlerSet, requestName);
                    break;
                case 'server_stream':
                    wrapServerStream(handlerSet, requestName);
                    break;
                case 'client_stream':
                    wrapClientStream(handlerSet, requestName);
                    break;
                case 'bidi':
                    wrapBidi(handlerSet, requestName);
                    break;
                default:
                    // Not expected. gRPC does not assign methodType to anything other
                    // than the values above.
                    break;
            }
            return result;
        };
    }
    // Wrap Server.prototype.register
    shimmer.wrap(server.Server.prototype, 'register', serverRegisterWrap);
}
function unpatchServer(server) {
    // Unwrap Server.prototype.register
    shimmer.unwrap(server.Server.prototype, 'register');
}
// # Exports
const plugin = [
    {
        file: 'src/node/src/client.js',
        versions: '0.13 - 1.6',
        patch: patchClient,
        unpatch: unpatchClient
    },
    {
        file: 'src/node/src/metadata.js',
        versions: '0.13 - 1.6',
        patch: patchMetadata,
        unpatch: unpatchMetadata
    },
    {
        file: 'src/node/src/server.js',
        versions: '0.13 - 1.6',
        patch: patchServer,
        unpatch: unpatchServer
    },
    {
        file: 'src/client.js',
        versions: '^1.7',
        patch: patchClient,
        unpatch: unpatchClient
    },
    {
        file: 'src/metadata.js',
        versions: '^1.7',
        patch: patchMetadata,
        unpatch: unpatchMetadata
    },
    {
        file: 'src/server.js',
        versions: '^1.7',
        patch: patchServer,
        unpatch: unpatchServer
    }
];
module.exports = plugin;
//# sourceMappingURL=plugin-grpc.js.map