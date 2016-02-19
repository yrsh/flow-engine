'use strict';
var url = require('url');

function invoke(props, context, next) {
    var logger = context.get('logger');
    var _returned = false;
    function _next(e) {
        if (!_returned) {
            next(e);
            _returned = true;
        }
        else {
            logger.warn("[invoke] has already returned earlier.");
        }
    };

    //the default settings and error object
    var options;
    var isSecured;
    var verb;
    var useChunk = false;
    var timeout = 60;
    var compression = false;
    var error = { name: 'property error' };
    var data, dataSz = 0;


    if (!props || typeof props !== 'object') {
        error.value = 'Invalid property object';
        error.message = error.value;
        _next(error);
        return;
    }

    if (typeof props['target-url'] === 'string')
        options = url.parse(props['target-url']);

    //target-url
    if (!options || !options.hostname || !options.protocol ||
            (options.protocol !== 'http:' && options.protocol !== 'https:')) {
        error.value = 'Invalid target-url: "' + props['target-url']  + '"';
        error.message = error.value;
        _next(error);
        return;
    }
    else {
        if (options.protocol === 'https:')
            isSecured = true;
    }
    logger.debug("invoke options: %j", options, {});

    //verb: default to request.verb
    verb = props.verb ? String(props.verb).toUpperCase() : context.request.verb;
    if (verb !== 'POST' && verb !== 'GET' && verb !== 'PUT' &&
        verb !== 'DELETE' && verb !== 'OPTIONS' && verb !== 'HEAD' &&
        verb !== 'PATCH') {
        error.value = 'Invalid verb: "' + props.verb + '"';
        error.message = error.value;
        _next(error);
        return;
    }
    else
        options.method = verb;
    logger.debug("invoke verb: %s", verb);

    //http-version: 1.1
    if (props['http-version'] && props['http-version'] !== '1.1') {
        error.value = 'Invalid http-version: "' + props['http-version'] + '"';
        error.message = error.value;
        _next(error);
        return;
    }

    //chunked-upload
    if (props['chunked-upload'] && props['chunked-upload'] !== 'false')
        useChunk = true;
    logger.debug("invoke useChunk: %s", useChunk);

    //timeout: between 1 to 86400 seconds
    if (!isNaN(parseInt(props.timeout))) {
        var tmp = parseInt(props.timeout);
        if (tmp < 1)
            timeout = 1;
        else if (tmp > 86400)
            timeout = 86400;
        else
            timeout = tmp;
    }
    logger.debug("invoke timeout: %s", timeout);

    //compression
    if (props.compresssion && props.compresssion !== 'false')
        compression = true;
    logger.debug("invoke compression: %s", compression);

    //authentication
    if (props.username && props.password)
        options.auth = props.username + ':' + props.password;
    logger.debug("invoke auth: %s", options.auth, {});

    //TODO: get the TLS profile

    //copy headers
    options.headers = {};
    for (var i in context.message.headers)
        options.headers[i] = context.message.headers[i];
    delete options.headers['host'];
    delete options.headers['connection'];
    delete options.headers['content-length'];

    //TODO: compress with zlib
    //prepare the data and dataSz
    data = context.message.body;
    if (!Buffer.isBuffer(data) && typeof data !== 'string') {
        if (typeof data === 'object')
            data = JSON.stringify(data);
        else
            data = String(data);
    }
    dataSz = data.length;

    if (!useChunk)
        options.headers['content-length'] = dataSz;

    logger.info('invoke w/ headers: %j', options.headers, {});

    //write the request
    var http = isSecured ? require('https') : require('http');

    var request = http.request(options, function(response) {
        //read the response
        var target = context.message;

        target.statusCode = response.statusCode;
        target.statusMessage = response.statusMessage;
        logger.info('invoke response: %d, %s', target.statusCode, target.statusMessage);

        target.headers = {};
        for (var i in response.headers)
            target.headers[i] = response.headers[i];

        target.body = '';
        response.on('data', function(chunk) {
            target.body += chunk;
        });

        //TODO: check the mime type and convert the target.body to JSON?
        response.on('end', function() {
            logger.info('invoke done');
            _next();
        });
    });

    //setup the timeout callback
    logger.debug("invoke set timeout to %s seconds", timeout);
    request.setTimeout(timeout * 1000, function() {
        logger.error('invoke policy timeouted');

        error.name = 'connection error';
        error.value = 'Invoke policy timeout';

        _next(error);
    });
    logger.debug('Timeout is set to %d seconds.', timeout);

    //setup the error callback
    request.on('error', function(e) {
        logger.error('invoke policy failed: %s', e);

        error.name = 'connection error';
        error.value = e.toString();

        _next(error);
    });

    logger.debug('invoke request: %s', data);
    request.write(data);
    request.end();
};

module.exports = function(config) {
    return invoke;
};