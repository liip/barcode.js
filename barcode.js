var Barcode = function (context, width, height) {
    this.context = context;
    this.width = width;
    this.height = height;
    this.debug = false;
};

Barcode.MAX_VARIANCE_SEPARATOR = 0.9;
Barcode.MAX_VARIANCE = 0.27;

Barcode.prototype.scan = function () {

    var horizontal = 2;

    while (horizontal--) {

        var length = horizontal ? this.width : this.height;
        var scan = 10;
        var step = length / scan;

        while (scan--) {

            var xy = (step * scan * 1.5) % length;

            if (horizontal) {
                var x = 0;
                var y = xy;
                var width = length;
                var height = 1;
            } else {
                var x = xy;
                var y = 0;
                var width = 1;
                var height = length;
            }

            var data = this.context.getImageData(x, y, width, height).data;
            var grey = Barcode.grey(data);

            for (var contrast = 10; contrast <= 750; contrast += 10) {

                var bits = Barcode.convert(grey, contrast);

                var reverse = 2;
                while (reverse--) {

                    var line = new Barcode.Line(bits, x, y, width, height, horizontal);

                    if (line.parse()) {
                        return line;
                    }

                    bits.reverse();
                }
            }
        }
    }

    return false;
};

Barcode.prototype.print = function (line) {

    for (var i = 0; i < line.bits.length; i++) {                        

        this.context.fillStyle = 'rgb(' + line.bits[i] + ', ' + line.bits[i] + ', ' + line.bits[i] + ')';

        if (line.horizontal) {
            this.context.fillRect(i, line.y, 1, 100);
        } else {
            this.context.fillRect(line.x, i, 100, 1);
        }
    }

    this.context.fillStyle = 'rgba(255, 0, 0, 0.5)';
    if (line.horizontal) {
        this.context.fillRect(line.x, line.y, line.width, 5);
    } else {
        this.context.fillRect(line.x, line.y, 5, line.height);
    }
};

Barcode.grey = function (data) {

    var grey = [];

    for (var i = 0, n = data.length; i < n; i += 4) {
        grey[grey.length] = data[i] + data[i + 1] + data[i + 2];
    }

    return grey;
};

Barcode.convert = function (grey, contrast) {

    var bits = [];

    for (var i = 0, n = grey.length; i < n; i++) {
        bits[i] = grey[i] < contrast ? 0 : 255;
    }

    return bits;
};

Barcode.runlength = function (bits) {

    var lines = [];
    var current = bits[0];
    var count = 0;
    for (var col = 0; col < bits.length; col++) {
        if (bits[col] == current) {
            count++;
        } else {
            lines.push(count);
            count = 1;
            current = bits[col];
        }
    }
    lines.push(count);

    return lines;
};

Barcode.Line = function (bits, x, y, width, height, horizontal) {
    this.bits = bits;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.horizontal = horizontal;

    this.start = 0;
    this.bar = 0;
    this.digits = [];

    this.isbn = '';
};

Barcode.Line.prototype.parse = function () {

    var lines = Barcode.runlength(this.bits);

    // find start
    var bar = 0, start = 0, end = 0;
    for (var i = 0; i < (lines.length - 3); i++) {

        var all = lines.slice(i, i + 59);

        var total = 0;
        for (var j = 0; j < all.length; j++) {
            total += all[j];
        }
        var bar = total / 95;

        var variance = (lines[i] / bar) * (lines[i + 1] / bar) * (lines[i + 2] / bar);

        if (Math.abs(1 - variance) < Barcode.MAX_VARIANCE_SEPARATOR) {

            // check middle
            var variance = (lines[i + 27] / bar) * (lines[i + 28] / bar) * (lines[i + 29] / bar) * (lines[i + 30] / bar) * (lines[i + 31] / bar);

            if (Math.abs(1 - variance) < Barcode.MAX_VARIANCE_SEPARATOR) {

                // check end
                var variance = (lines[i + 56] / bar) * (lines[i + 57] / bar) * (lines[i + 58] / bar);

                if (Math.abs(1 - variance) < Barcode.MAX_VARIANCE_SEPARATOR) {

                    end = i + 59;
                    start = i + 3;

                    // start, middle and end found
                    break;
                }
            }
        }
    }

    if (end == 0) {

        // no end found
        return false;
    }

    // decode barcode
    var GROUP = 6;

    var isbn = '';
    var sum = '';

    var bars = lines.slice(start, start + 4 * GROUP);
    bars = bars.concat(lines.slice(start + 4 * GROUP + 5, start + 4 * 2 * GROUP + 5));
    for (var i = 0; i < 2 * GROUP; i++) {

        var digits = [
            bars[i * 4],
            bars[i * 4 + 1],
            bars[i * 4 + 2],
            bars[i * 4 + 3]
        ];
        this.digits.push(digits);

        var pattern = Barcode.EAN13.match(digits, bar);
        if (pattern) {
            sum += 'L';
        } else {
            sum += 'G';
            pattern = Barcode.EAN13.match(digits.reverse(), bar);
        }

        if (!pattern) {
            // no pattern match found
            return false;
        }

        isbn += pattern;
    }

    var first = Barcode.EAN13.FIRST_DIGITS[sum.substr(0, 6)] || false;

    if (!first) {
        // no first pattern found
        return false;
    }

    this.isbn = first + isbn;

    return Barcode.EAN13.checksum(this.isbn);
};

Barcode.EAN13 = {
    PATTERNS: [
        [3, 2, 1, 1], // 0
        [2, 2, 2, 1], // 1
        [2, 1, 2, 2], // 2
        [1, 4, 1, 1], // 3
        [1, 1, 3, 2], // 4
        [1, 2, 3, 1], // 5
        [1, 1, 1, 4], // 6
        [1, 3, 1, 2], // 7
        [1, 2, 1, 3], // 8
        [3, 1, 1, 2]  // 9
    ],
    FIRST_DIGITS: {
        'LLLLLL': '0',
        'LLGLGG': '1',
        'LLGGLG': '2',
        'LLGGGL': '3',
        'LGLLGG': '4',
        'LGGLLG': '5',
        'LGGGLL': '6',
        'LGLGLG': '7',
        'LGLGGL': '8',
        'LGGLGL': '9'
    },
    checksum: function (isbn) {

        var length = isbn.length;
        var sum = 0;

        for (var i = 0; i < length; i++) {

            if (i % 2 == 0) {
                sum += parseInt(isbn[i]);
            } else {
                sum += parseInt(isbn[i]) * 3;
            }
        }

        return sum % 10 == 0;
    },
    match: function (digits, bar) {

        var best = Barcode.MAX_VARIANCE;
        var variance = 0;
        var match = false;

        for (var j = 0; j < this.PATTERNS.length; j++) {

            variance = this.variance(digits, this.PATTERNS[j], bar);

            if (variance < best) {
                best = variance;
                match = "" + j;
            }
        }

        return match;
    },
    variance: function (digits, pattern, bar) {

        var sum = digits[0] + digits[1] + digits[2] + digits[3];
        if (isNaN(sum)) {
            return 9999;
        }
        var total = 0;

        total += Math.abs(digits[0] - pattern[0] * bar);
        total += Math.abs(digits[1] - pattern[1] * bar);
        total += Math.abs(digits[2] - pattern[2] * bar);
        total += Math.abs(digits[3] - pattern[3] * bar);

        return total / sum;
    }
};
