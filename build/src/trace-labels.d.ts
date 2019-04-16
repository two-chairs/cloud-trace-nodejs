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
/**
 * Well-known trace span label values.
 */
export declare const TraceLabels: {
    /**
     * The well-known label for http status code.
     */
    HTTP_RESPONSE_CODE_LABEL_KEY: string;
    /**
     * The well-known label for http request url.
     */
    HTTP_URL_LABEL_KEY: string;
    /**
     * The well-known label for http method.
     */
    HTTP_METHOD_LABEL_KEY: string;
    /**
     * The well-known label for http response size.
     */
    HTTP_RESPONSE_SIZE_LABEL_KEY: string;
    /**
     * The well-known label for stack-traces
     */
    STACK_TRACE_DETAILS_KEY: string;
    /**
     * The well-known label for network error name.
     */
    ERROR_DETAILS_NAME: string;
    /**
     * The well-known label for network error message.
     */
    ERROR_DETAILS_MESSAGE: string;
    /**
     * The well-known label for the app version on AppEngine.
     */
    GAE_VERSION: string;
    /**
     * @type {string} The well-known label for the module name on AppEngine.
     */
    GAE_MODULE_NAME: string;
    /**
     * The well-known label for the module version on AppEngine.
     */
    GAE_MODULE_VERSION: string;
    /**
     * The label for GCE instance id. This is not a label recognized by the trace
     * API.
     */
    GCE_INSTANCE_ID: string;
    /**
     * The label for GCE hostname. This is not a label recognized by the trace
     * API.
     */
    GCE_HOSTNAME: string;
    /**
     * The label for http request source ip. This is not a label recognized by the
     * trace API.
     */
    HTTP_SOURCE_IP: string;
    /**
     * The well-known label for agent metadata. Values should have the form
     * "<name> <version>".
     */
    AGENT_DATA: string;
};
