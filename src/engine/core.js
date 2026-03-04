(function initMiniEngine(globalScope) {
  "use strict";

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rectIntersect(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  function circleRectIntersect(circle, rect) {
    var closestX = clamp(circle.x, rect.x, rect.x + rect.w);
    var closestY = clamp(circle.y, rect.y, rect.y + rect.h);
    var dx = circle.x - closestX;
    var dy = circle.y - closestY;
    return dx * dx + dy * dy < circle.r * circle.r;
  }

  function Entity(id) {
    this.id = id;
    this.active = true;
    this.tags = new Set();
    this.components = new Map();
  }

  Entity.prototype.addTag = function addTag(tag) {
    this.tags.add(tag);
    return this;
  };

  Entity.prototype.hasTag = function hasTag(tag) {
    return this.tags.has(tag);
  };

  Entity.prototype.set = function set(name, value) {
    this.components.set(name, value);
    return this;
  };

  Entity.prototype.get = function get(name) {
    return this.components.get(name);
  };

  Entity.prototype.has = function has(name) {
    return this.components.has(name);
  };

  function World() {
    this.entities = [];
    this.systems = [];
    this.nextEntityId = 1;
    this.pendingDestroy = new Set();
  }

  World.prototype.createEntity = function createEntity() {
    var entity = new Entity(this.nextEntityId++);
    this.entities.push(entity);
    return entity;
  };

  World.prototype.destroyEntity = function destroyEntity(entity) {
    this.pendingDestroy.add(entity.id);
  };

  World.prototype.addSystem = function addSystem(system, priority) {
    var resolvedPriority = typeof priority === "number" ? priority : 0;
    this.systems.push({ priority: resolvedPriority, system: system });
    this.systems.sort(function byPriority(a, b) {
      return a.priority - b.priority;
    });
    return this;
  };

  World.prototype.query = function query(filterFn) {
    return this.entities.filter(function isAlive(entity) {
      return entity.active && filterFn(entity);
    });
  };

  World.prototype.update = function update(dt, engine) {
    for (var i = 0; i < this.systems.length; i += 1) {
      var system = this.systems[i].system;
      if (typeof system.update === "function") {
        system.update(this, dt, engine);
      }
    }
    this.flushDestroyed();
  };

  World.prototype.render = function render(ctx, engine, alpha) {
    for (var i = 0; i < this.systems.length; i += 1) {
      var system = this.systems[i].system;
      if (typeof system.render === "function") {
        system.render(this, ctx, engine, alpha);
      }
    }
  };

  World.prototype.flushDestroyed = function flushDestroyed() {
    var self = this;
    if (this.pendingDestroy.size === 0) return;
    this.entities = this.entities.filter(function keepEntity(entity) {
      return !self.pendingDestroy.has(entity.id);
    });
    this.pendingDestroy.clear();
  };

  function normalizeCodes(event) {
    var codes = [];

    if (event && event.code) {
      codes.push(event.code);
    }

    if (!event || typeof event.key !== "string") {
      return codes;
    }

    var key = event.key.toLowerCase();
    if (key === " " || key === "spacebar") codes.push("Space");
    if (key === "w") codes.push("KeyW");
    if (key === "arrowup") codes.push("ArrowUp");

    return Array.from(new Set(codes));
  }

  function Input(targetElement) {
    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.keysReleased = new Set();

    var self = this;

    this.handleKeyDown = function handleKeyDown(event) {
      var codes = normalizeCodes(event);
      for (var i = 0; i < codes.length; i += 1) {
        var code = codes[i];
        if (!self.keysDown.has(code)) self.keysPressed.add(code);
        self.keysDown.add(code);
      }

      if (codes.includes("Space") || codes.includes("ArrowUp")) {
        event.preventDefault();
      }
    };

    this.handleKeyUp = function handleKeyUp(event) {
      var codes = normalizeCodes(event);
      for (var i = 0; i < codes.length; i += 1) {
        var code = codes[i];
        self.keysDown.delete(code);
        self.keysReleased.add(code);
      }
    };

    this.handleTapStart = function handleTapStart() {
      if (!self.keysDown.has("Tap")) self.keysPressed.add("Tap");
      self.keysDown.add("Tap");
    };

    this.handleTapEnd = function handleTapEnd() {
      self.keysDown.delete("Tap");
      self.keysReleased.add("Tap");
    };

    this.handleClickFallback = function handleClickFallback() {
      self.keysPressed.add("Tap");
    };

    window.addEventListener("keydown", this.handleKeyDown, { passive: false });
    window.addEventListener("keyup", this.handleKeyUp);

    targetElement.addEventListener("pointerdown", this.handleTapStart, { passive: true });
    targetElement.addEventListener("pointerup", this.handleTapEnd, { passive: true });
    targetElement.addEventListener("pointercancel", this.handleTapEnd, { passive: true });
    targetElement.addEventListener("pointerleave", this.handleTapEnd, { passive: true });
    targetElement.addEventListener("click", this.handleClickFallback, { passive: true });

    targetElement.addEventListener("touchstart", this.handleTapStart, { passive: true });
    targetElement.addEventListener("touchend", this.handleTapEnd, { passive: true });
  }

  Input.prototype.beginFrame = function beginFrame() {
    this.keysPressed.clear();
    this.keysReleased.clear();
  };

  Input.prototype.isDown = function isDown(code) {
    return this.keysDown.has(code);
  };

  Input.prototype.isPressed = function isPressed(code) {
    return this.keysPressed.has(code);
  };

  Input.prototype.isReleased = function isReleased(code) {
    return this.keysReleased.has(code);
  };

  function Engine(options) {
    var config = options || {};
    this.canvas = config.canvas;
    this.ctx = this.canvas.getContext("2d");
    this.width = config.width || 400;
    this.height = config.height || 640;
    this.background = config.background || "#8fd3ff";
    this.world = new World();
    this.input = new Input(this.canvas);

    this.running = false;
    this.lastTime = 0;
    this.accumulator = 0;
    this.fixedStep = 1 / 60;
    this.maxFrameTime = 0.25;

    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.loop = this.loop.bind(this);
  }

  Engine.prototype.start = function start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now() / 1000;
    requestAnimationFrame(this.loop);
  };

  Engine.prototype.stop = function stop() {
    this.running = false;
  };

  Engine.prototype.clear = function clear() {
    this.ctx.fillStyle = this.background;
    this.ctx.fillRect(0, 0, this.width, this.height);
  };

  Engine.prototype.loop = function loop(timestampMs) {
    if (!this.running) return;

    var now = timestampMs / 1000;
    var frameTime = now - this.lastTime;
    this.lastTime = now;

    if (frameTime > this.maxFrameTime) frameTime = this.maxFrameTime;
    this.accumulator += frameTime;

    while (this.accumulator >= this.fixedStep) {
      this.world.update(this.fixedStep, this);
      this.accumulator -= this.fixedStep;
      this.input.beginFrame();
    }

    this.clear();
    this.world.render(this.ctx, this, this.accumulator / this.fixedStep);
    requestAnimationFrame(this.loop);
  };

  globalScope.MiniEngine = {
    Entity: Entity,
    World: World,
    Engine: Engine,
    clamp: clamp,
    rectIntersect: rectIntersect,
    circleRectIntersect: circleRectIntersect,
  };
})(window);
