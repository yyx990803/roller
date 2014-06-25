var Hammer = require('hammerjs'),
    Emitter = require('events').EventEmitter

// configurable params
var defaults = {
    elipson             : 0.1,
    dragEase            : 1,
    friction            : 0.95,
    pageSwitchThreshold : 40,
    pageSwitchDragDamp  : 0.3,
    pageSnapEase        : 5,
    pageBounceEase      : 3.5,
    pageSnapFriction    : 0.9,
    currentPage         : 0,
    horizontal          : false
}

function Roller (options) {

    if (!options.el) {
        return console.warn('Roller: requires a target element.')
    }

    Emitter.call(this)

    this.el = options.el

    // initial states
    this.dragging = false
    this.enabled  = false

    this.y        = 0
    this.lastY    = 0
    this.ty       = 0
    this.startY   = 0
    this.momentum = 0

    this.upperBound = this.lowerBound = 0

    // merge options
    for (var key in defaults) {
        this[key] = defaults[key]
    }
    for (var key in options) {
        this[key] = options[key]
    }

    // setup events
    var self = this
    Hammer(this.el)
        .on('touch', function () {
            self.momentum = 0
        })
        .on('dragstart', function () {
            if (!self.enabled) return
            self.dragging = true
            self.onStart()
        })
        .on('drag', function (e) {
            if (!self.enabled) return
            self.onMove(e.gesture)
        })
        .on('dragend', function () {
            if (!self.enabled) return
            self.dragging = false
            self.onEnd()
        })

    // option force enabled on start
    if (this.enabled) {
        this.loop()
    }
}

Roller.prototype = Object.create(Emitter.prototype)

Roller.prototype.enable = function () {
    if (this.enabled) return
    this.enabled = true
    this.loop()
}

Roller.prototype.disable = function () {
    this.enabled = false
}

Roller.prototype.loop = function () {
    if (!this.enabled) return
    requestAnimationFrame(this.loop.bind(this))
    this.update()
}

Roller.prototype.update = function () {
    
    this.lastY = this.y

    if (!this.dragging) {
        this.ty += this.momentum
        this.momentum *= this.friction
        if (Math.abs(this.momentum) < this.elipson) {
            this.momentum = 0
        }

        // section logic
        var upperBound, lowerBound, currentPage
        if (!this.pages) {
            // single section scroll
            upperBound = this.upperBound
            lowerBound = this.lowerBound
        } else {
            // multi section scroll
            currentPage = this.pages[this.currentPage]
            upperBound = currentPage.upperBound || 0
            lowerBound = currentPage.lowerBound || 0
        }

        // out of bound elastic bounce
        if (lowerBound > upperBound) {
            console.warn('Roller: lowerBound is bigger than upperBound, something is wrong.')
        } else if (this.ty > upperBound) {
            this.momentum *= this.pageSnapFriction
            if (this.ty - upperBound < this.elipson) {
                this.ty = upperBound
            } else {
                this.ty += (upperBound - this.ty) / this.pageBounceEase
            }
        } else if (this.ty < lowerBound) {
            this.momentum *= this.pageSnapFriction
            if (lowerBound - this.ty < this.elipson) {
                this.ty = lowerBound
            } else {
                this.ty += (lowerBound - this.ty) / this.pageBounceEase
            }
        }
    }

    if (this.ty === this.y) {
        return
    } else if (Math.abs(this.ty - this.y) < this.elipson) {
        this.y = this.ty
        if (this.cb) {
            this.cb()
            this.cb = null
        }
    } else {
        this.y += (this.ty - this.y) / (this.dragging ? this.dragEase : this.pageSnapEase)
    }

    this.emit('update', this.y)
}

Roller.prototype.onStart = function () {
    this.startY = this.y
}

Roller.prototype.onMove = function (g) {

    var dy = this.horizontal ? g.deltaX : g.deltaY
    this.ty = this.startY + dy

    var upperBound, lowerBound, currentPage
    if (!this.pages) {
        upperBound = this.upperBound
        lowerBound = this.lowerBound
    } else {
        currentPage = this.pages[this.currentPage]
        upperBound = currentPage.upperBound
        lowerBound = currentPage.lowerBound
    }

    // out of bound drag damp
    if (this.ty > upperBound) {
        this.ty += (upperBound - this.ty) * (1 - this.pageSwitchDragDamp)
    } else if (this.ty < lowerBound) {
        this.ty += (lowerBound - this.ty) * (1 - this.pageSwitchDragDamp)
    }

    // up/down hooks
    if (Math.abs(dy) > 10) {
        if (dy < 0) {
            this.emit('up')
        } else {
            this.emit('down')
        }
    }

}

Roller.prototype.onEnd = function () {

    var upperBound, lowerBound, page, cur
    if (!this.pages) {
        upperBound = this.upperBound
        lowerBound = this.lowerBound
    } else {
        cur = this.currentPage
        page = this.pages[cur]
        upperBound = page.upperBound
        lowerBound = page.lowerBound
    }

    if (
        (cur != null && cur > 0) &&
        this.ty > upperBound + this.pageSwitchThreshold
    ) {
        this.go(cur - 1)
    } else if (
        (cur != null && cur < this.pages.length - 1) &&
        this.ty < lowerBound - this.pageSwitchThreshold
    ) {
        this.go(cur + 1)
    } else {
        this.momentum = this.y - this.lastY
    }
}

Roller.prototype.go = function (pageID, emit, cb) {

    this.enable()

    if (pageID === this.currentPage) return cb && cb()

    this.prevPage = this.currentPage
    this.currentPage = pageID
    
    var target = this.pages[pageID],
        snapPoint = this.currentPage > this.prevPage
            ? 'upperBound'
            : 'lowerBound'
    this.ty = target[snapPoint]
    this.cb = cb

    if (emit === false) return

    var e = {
        from : this.prevPage,
        to   : this.currentPage
    }
    this.emit('change', e)
    this.emit('enter:' + e.to, e)
    this.emit('leave:' + e.from, e)

}

Roller.prototype.reset = function () {
    this.y = this.ty = this.startY = this.lastY = this.momentum = 0
    this.emit('update', 0)
}

module.exports = Roller