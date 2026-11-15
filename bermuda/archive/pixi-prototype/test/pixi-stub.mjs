// Minimal Pixi stand-in: enough surface for game.ts / render.ts to load in Node.

function chainable(target) {
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop]
      const fn = () => proxy
      obj[prop] = fn
      return fn
    },
    set(obj, prop, value) {
      obj[prop] = value
      return true
    }
  })
  // eslint-disable-next-line no-var
  var proxy // hoisted, assigned below
}

class Container {
  constructor() {
    this.children = []
    this.x = 0
    this.y = 0
    this.visible = true
    this.alpha = 1
    this.sortableChildren = false
    this.scale = { x: 1, y: 1, set() {} }
    this.position = { x: 0, y: 0, set() {} }
    this.anchor = { x: 0, y: 0, set() {} }
    this.filters = null
    this.mask = null
    this.parent = null
  }
  addChild(c) { this.children.push(c); c.parent = this; return c }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c }
  removeChildren() { this.children = [] }
  destroy() { this.children = [] }
}

class Sprite extends Container {
  constructor(texture) {
    super()
    this.texture = texture
    this.width = 0
    this.height = 0
    this.tint = 0xffffff
    this.rotation = 0
    this.zIndex = 0
    this.eventMode = 'none'
    this.cullable = false
  }
  setFromTexture() {}
}

class Graphics extends Container {
  constructor() { super(); this.geometry = {} }
}

for (const m of ['moveTo', 'lineTo', 'beginFill', 'endFill', 'drawRect', 'drawCircle',
  'rect', 'circle', 'poly', 'fill', 'stroke', 'clear', 'arc', 'closePath', 'ellipse']) {
  Graphics.prototype[m] = function () { return this }
}

class Texture {
  constructor(w = 1, h = 1) { this.width = w; this.height = h; this.frame = { width: w, height: h } }
  static from() { return new Texture() }
  static fromImage() { return new Texture() }
}
Texture.WHITE = new Texture()

class Rectangle {
  constructor(x = 0, y = 0, w = 0, h = 0) { Object.assign(this, { x, y, width: w, height: h }) }
}

class Application {
  constructor() {
    this.stage = new Container()
    this.screen = { width: 1280, height: 720 }
    this.canvas = { style: {}, getContext: () => null }
    this.renderer = { resize() {}, render() {}, width: 1280, height: 720 }
    this.ticker = { add() {}, remove() {}, maxFPS: 60 }
  }
  async init() { return this }
  render() {}
}

const Assets = {
  async load() { return new Proxy({}, { get: () => new Texture() }) },
  get() { return new Texture() }
}

export {
  Application, Container, Graphics, Rectangle, Sprite, Texture, Assets,
  Assets as assets
}
export default { Application, Container, Graphics, Rectangle, Sprite, Texture, Assets }
