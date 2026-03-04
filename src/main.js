(function startGame(globalScope) {
  "use strict";

  var MiniEngine = globalScope.MiniEngine;
  var FlappyGame = globalScope.FlappyGame;

  if (!MiniEngine || !FlappyGame) {
    throw new Error("Required scripts are not loaded.");
  }

  var canvas = document.getElementById("game");
  var shell = document.querySelector(".shell");

  var engine = new MiniEngine.Engine({
    canvas: canvas,
    width: 400,
    height: 640,
    background: "#8fd3ff",
  });

  FlappyGame.createFlappyGame(engine);
  engine.start();

  function fitCanvas() {
    var viewportW = window.innerWidth;
    var viewportH = window.innerHeight;
    var maxW = Math.min(520, viewportW * 0.94);
    var maxH = Math.max(280, viewportH - 110);
    var ratio = engine.width / engine.height;

    var renderW = maxW;
    var renderH = renderW / ratio;

    if (renderH > maxH) {
      renderH = maxH;
      renderW = renderH * ratio;
    }

    canvas.style.width = String(renderW) + "px";
    canvas.style.height = String(renderH) + "px";
    shell.style.width = String(Math.max(280, renderW + 28)) + "px";
  }

  fitCanvas();
  window.addEventListener("resize", fitCanvas);
})(window);
