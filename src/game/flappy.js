(function initFlappyGame(globalScope) {
  "use strict";

  var MiniEngine = globalScope.MiniEngine;
  if (!MiniEngine) {
    throw new Error("MiniEngine must be loaded before FlappyGame.");
  }

  var clamp = MiniEngine.clamp;
  var circleRectIntersect = MiniEngine.circleRectIntersect;

  var WORLD_WIDTH = 400;
  var WORLD_HEIGHT = 640;
  var GROUND_HEIGHT = 90;
  var GRAVITY = 980;
  var FLAP_SPEED = -320;
  var PIPE_SPEED = -140;
  var PIPE_WIDTH = 68;
  var PIPE_GAP = 168;
  var PIPE_SPAWN_SECONDS = 1.45;
  var BIRD_X = 110;
  var BIRD_RADIUS = 15;
  var BEST_KEY = "mini_engine_flappy_best";

  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function safeReadBest() {
    try {
      var value = globalScope.localStorage.getItem(BEST_KEY);
      if (value == null) return 0;
      var parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    } catch (error) {
      return 0;
    }
  }

  function safeWriteBest(value) {
    try {
      globalScope.localStorage.setItem(BEST_KEY, String(value));
    } catch (error) {
      // Ignore storage errors to keep gameplay functional.
    }
  }

  function makeBird(world) {
    return world
      .createEntity()
      .addTag("bird")
      .set("position", { x: BIRD_X, y: WORLD_HEIGHT * 0.45 })
      .set("velocity", { x: 0, y: 0 })
      .set("bird", { radius: BIRD_RADIUS, tilt: 0 });
  }

  function makePipe(world, x, y, w, h, isTop) {
    return world
      .createEntity()
      .addTag("pipe")
      .set("position", { x: x, y: y })
      .set("velocity", { x: PIPE_SPEED, y: 0 })
      .set("box", { w: w, h: h })
      .set("pipe", { isTop: isTop, counted: false });
  }

  function createFlappyGame(engine) {
    var world = engine.world;
    var state = {
      mode: "ready",
      score: 0,
      best: safeReadBest(),
      spawnTimer: 0,
      flashTime: 0,
    };

    var bird = makeBird(world);

    function resetRound() {
      var i = 0;
      var pipes = world.query(function isPipe(entity) {
        return entity.hasTag("pipe");
      });

      for (i = 0; i < pipes.length; i += 1) {
        world.destroyEntity(pipes[i]);
      }

      var position = bird.get("position");
      var velocity = bird.get("velocity");
      var birdState = bird.get("bird");

      position.x = BIRD_X;
      position.y = WORLD_HEIGHT * 0.45;
      velocity.x = 0;
      velocity.y = 0;
      birdState.tilt = 0;

      state.mode = "ready";
      state.score = 0;
      state.spawnTimer = 0;
      state.flashTime = 0;
    }

    function flapRequested(input) {
      return (
        input.isPressed("Space") ||
        input.isPressed("KeyW") ||
        input.isPressed("ArrowUp") ||
        input.isPressed("Tap")
      );
    }

    function spawnPipePair() {
      var minGapCenter = 140;
      var maxGapCenter = WORLD_HEIGHT - GROUND_HEIGHT - 140;
      var gapCenter = randomRange(minGapCenter, maxGapCenter);
      var topHeight = gapCenter - PIPE_GAP / 2;
      var bottomY = gapCenter + PIPE_GAP / 2;
      var bottomHeight = WORLD_HEIGHT - GROUND_HEIGHT - bottomY;
      var pipeX = WORLD_WIDTH + 24;

      makePipe(world, pipeX, 0, PIPE_WIDTH, topHeight, true);
      makePipe(world, pipeX, bottomY, PIPE_WIDTH, bottomHeight, false);
    }

    function endGame() {
      if (state.mode === "gameover") return;
      state.mode = "gameover";
      state.flashTime = 0.15;

      if (state.score > state.best) {
        state.best = state.score;
        safeWriteBest(state.best);
      }
    }

    world
      .addSystem(
        {
          update: function updateBird(currentWorld, dt, currentEngine) {
            var position = bird.get("position");
            var velocity = bird.get("velocity");
            var birdState = bird.get("bird");
            var input = currentEngine.input;
            var flap = flapRequested(input);

            if (state.mode === "ready" && flap) {
              state.mode = "running";
              velocity.y = FLAP_SPEED;
            } else if (state.mode === "running" && flap) {
              velocity.y = FLAP_SPEED;
            } else if (state.mode === "gameover" && flap) {
              resetRound();
              return;
            }

            if (state.mode === "ready") {
              position.y = WORLD_HEIGHT * 0.45 + Math.sin(performance.now() * 0.0045) * 6;
              birdState.tilt = -0.12;
              return;
            }

            if (state.mode !== "running") return;

            velocity.y += GRAVITY * dt;
            position.y += velocity.y * dt;
            birdState.tilt = clamp(velocity.y / 440, -0.5, 1.1);

            if (position.y + BIRD_RADIUS >= WORLD_HEIGHT - GROUND_HEIGHT) {
              position.y = WORLD_HEIGHT - GROUND_HEIGHT - BIRD_RADIUS;
              endGame();
            }

            if (position.y - BIRD_RADIUS < 0) {
              position.y = BIRD_RADIUS;
              velocity.y = 0;
            }

            state.spawnTimer += dt;
            if (state.spawnTimer >= PIPE_SPAWN_SECONDS) {
              state.spawnTimer = 0;
              spawnPipePair();
            }

            if (state.flashTime > 0) state.flashTime -= dt;
          },
        },
        1
      )
      .addSystem(
        {
          update: function updatePipes(currentWorld, dt) {
            var pipes = currentWorld.query(function isPipe(entity) {
              return entity.hasTag("pipe");
            });

            for (var i = 0; i < pipes.length; i += 1) {
              var entity = pipes[i];
              var position = entity.get("position");
              var velocity = entity.get("velocity");
              var box = entity.get("box");
              var pipeState = entity.get("pipe");
              var birdPos = bird.get("position");

              position.x += velocity.x * dt;

              if (
                state.mode === "running" &&
                pipeState.isTop &&
                !pipeState.counted &&
                position.x + box.w < birdPos.x
              ) {
                pipeState.counted = true;
                state.score += 1;
              }

              if (position.x + box.w < -8) {
                currentWorld.destroyEntity(entity);
              }
            }
          },
        },
        2
      )
      .addSystem(
        {
          update: function updateCollisions(currentWorld) {
            if (state.mode !== "running") return;

            var birdPos = bird.get("position");
            var birdBody = bird.get("bird");
            var circle = { x: birdPos.x, y: birdPos.y, r: birdBody.radius };

            var pipes = currentWorld.query(function isPipe(entity) {
              return entity.hasTag("pipe");
            });

            for (var i = 0; i < pipes.length; i += 1) {
              var entity = pipes[i];
              var position = entity.get("position");
              var box = entity.get("box");
              var rect = { x: position.x, y: position.y, w: box.w, h: box.h };

              if (circleRectIntersect(circle, rect)) {
                endGame();
                break;
              }
            }
          },
        },
        3
      )
      .addSystem(
        {
          render: function renderScene(currentWorld, ctx) {
            var sky = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
            sky.addColorStop(0, "#92dfff");
            sky.addColorStop(1, "#d7f5ff");
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

            ctx.fillStyle = "#ffffffaa";
            ctx.beginPath();
            ctx.ellipse(86, 90, 34, 16, 0, 0, Math.PI * 2);
            ctx.ellipse(112, 90, 24, 12, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.ellipse(280, 140, 42, 17, 0, 0, Math.PI * 2);
            ctx.ellipse(318, 140, 28, 13, 0, 0, Math.PI * 2);
            ctx.fill();

            var pipes = currentWorld.query(function isPipe(entity) {
              return entity.hasTag("pipe");
            });

            for (var i = 0; i < pipes.length; i += 1) {
              var entity = pipes[i];
              var position = entity.get("position");
              var box = entity.get("box");

              ctx.fillStyle = "#5ecf5d";
              ctx.fillRect(position.x, position.y, box.w, box.h);
              ctx.fillStyle = "#40a847";
              ctx.fillRect(position.x - 4, position.y + box.h - 12, box.w + 8, 12);
            }

            ctx.fillStyle = "#decf7d";
            ctx.fillRect(0, WORLD_HEIGHT - GROUND_HEIGHT, WORLD_WIDTH, GROUND_HEIGHT);
            ctx.fillStyle = "#b89d49";
            ctx.fillRect(0, WORLD_HEIGHT - GROUND_HEIGHT, WORLD_WIDTH, 14);

            var birdPos = bird.get("position");
            var birdState = bird.get("bird");

            ctx.save();
            ctx.translate(birdPos.x, birdPos.y);
            ctx.rotate(birdState.tilt);

            ctx.fillStyle = "#ffd84f";
            ctx.beginPath();
            ctx.arc(0, 0, birdState.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#f9b233";
            ctx.beginPath();
            ctx.ellipse(-4, 2, 10, 6, -0.3, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(5, -6, 4.4, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#1b1b1b";
            ctx.beginPath();
            ctx.arc(6.4, -6, 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#ef7f27";
            ctx.beginPath();
            ctx.moveTo(11, -1);
            ctx.lineTo(24, 2);
            ctx.lineTo(11, 6);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            ctx.fillStyle = "#153b57";
            ctx.textAlign = "center";
            ctx.font = "bold 48px Trebuchet MS";
            ctx.fillText(String(state.score), WORLD_WIDTH / 2, 70);

            if (state.mode === "ready") {
              ctx.font = "bold 26px Trebuchet MS";
              ctx.fillText("Tap / Space to Start", WORLD_WIDTH / 2, WORLD_HEIGHT * 0.32);
            }

            if (state.mode === "gameover") {
              ctx.fillStyle = "#00000066";
              ctx.fillRect(30, WORLD_HEIGHT * 0.28, WORLD_WIDTH - 60, 190);

              ctx.fillStyle = "#ffffff";
              ctx.font = "bold 34px Trebuchet MS";
              ctx.fillText("Game Over", WORLD_WIDTH / 2, WORLD_HEIGHT * 0.36);

              ctx.font = "bold 24px Trebuchet MS";
              ctx.fillText("Score: " + state.score, WORLD_WIDTH / 2, WORLD_HEIGHT * 0.42);
              ctx.fillText("Best: " + state.best, WORLD_WIDTH / 2, WORLD_HEIGHT * 0.47);

              ctx.font = "20px Trebuchet MS";
              ctx.fillText("Tap / Space to Retry", WORLD_WIDTH / 2, WORLD_HEIGHT * 0.53);
            }

            if (state.flashTime > 0) {
              ctx.fillStyle = "rgba(255,255,255," + state.flashTime * 2.5 + ")";
              ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
            }
          },
        },
        10
      );
  }

  globalScope.FlappyGame = {
    createFlappyGame: createFlappyGame,
  };
})(window);
