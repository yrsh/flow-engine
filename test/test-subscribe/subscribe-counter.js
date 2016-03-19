// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: flow-engine
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

module.exports = function (config) {

    return function (props, context, flow) {
        var logger = flow.logger;
        logger.debug('execute subscribe task');
        var count;
        var eh = function(event, next) {
            if (props['next-error']) {
                count = getCount(context.get('verify-me'));
                context.set('verify-me', 'ev-error-' + (count+1));
                next(new Error('from subscribe-finish-counter'));
            } else {
                count = getCount(context.get('verify-me'));
                context.set('verify-me', 'ev-ok-' + (count+1));
                next();
            }
        };
        var events = props.event.split(',');
        events.forEach( function ( event ) {
            flow.subscribe(event, eh);
        });
        flow.proceed();
    };
};

function getCount(value) {
    var re, match;
    if ( value === undefined ) {
        return 0;
    } else if (value.indexOf('ev-error') === 0) {
        re = /ev-error-(\d)/;
        match = re.exec(value);
        return parseInt(match[1]);
    } else if ( value.indexOf('ev-ok') === 0) {
        re = /ev-ok-(\d)/;
        match = re.exec(value);
        return parseInt(match[1]);
    }
    return 0;
}