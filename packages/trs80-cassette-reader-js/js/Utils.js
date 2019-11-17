"use strict";

define({
    /**
     * Convert a number to a string.
     * 
     * @param {number} n number to convert
     * @param {number} base base of the number
     * @param {number} size zero-pad to this many digits
     */
    pad: function (n, base, size) {
        var s = n.toString(base);

        if (base === 16) {
            // I prefer upper case hex.
            s = s.toUpperCase();
        }

        while (s.length < size) {
            s = "0" + s;
        }

        return s;
    }
});