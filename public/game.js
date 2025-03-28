// Намиране на елементи от HTML
const canvas = document.getElementById("gameCanvas"); // Канвас, където ще се рисува играта
const ctx = canvas.getContext("2d"); // 2D контекст за рисуване върху канваса
const connectButton = document.getElementById("connectButton"); 
const refreshButton = document.getElementById("refreshButton");

// Настройка на размерите на канваса
canvas.width = 800; 
canvas.height = 600; 

// Настройка на играча
let player = {
    x: canvas.width / 2, // Позиция по X в центъра
    y: canvas.height / 2, // Позиция по Y в центъра
    radius: 20,          // Размер на кръга
    color: null,         // Цветът се задава от сървъра
    speed: 5,            // Скорост на движение
    name: null,          // Името на играча, ще бъде зададено от сесията
};

let otherPlayers = {};  // Съхранява информация за другите играчи
let triangles = [];     // Списък с триъгълници (храна)
let socket = null;      // Уеб сокет връзка със сървъра
let gameLoopId = null;  // ID на текущия цикъл на играта. Спира и рестартира

// Функция за нулиране на състоянието на играта
function resetGameState() {
    if (socket) {
        socket.emit("playerLeftGame", player.name); // Уведомява сървъра, че играчът е напуснал
        socket.disconnect(); 
        socket = null;
    }
    if (gameLoopId) {
        cancelAnimationFrame(gameLoopId); // Спираме рендерирането на анимацията
        gameLoopId = null;
    }

    // Нулираме данните на играча
    player = { 
        ...player, 
        x: canvas.width / 2, 
        y: canvas.height / 2, 
        radius: 20, 
        color: null 
    };

    // Изчистване на играчи, триъгълници и канваса
    otherPlayers = {}; 
    triangles = [];   
    ctx.clearRect(0, 0, canvas.width, canvas.height); 
    connectToGame(); 
}

// Функция за свързване към играта
function connectToGame() {
    if (!socket) {
        socket = io(); // Създаване на нова сокет връзка
    }

    console.log(`Свързване към сървъра...`);

    socket.emit("newPlayer", player); // Уведомяване на сървъра за нов играч

    // Обновяване на състоянието на играта от сървъра
    socket.on("updateState", (data) => {
        const { players, triangles: updatedTriangles } = data;

        // Обновяване на текущия играч и другите играчи
        Object.keys(players).forEach((id) => { // Създава списък с ID на всички играчи
            if (id === socket.id) { // Сравнява ID на играча с ID изпратено от сървъра
                player = { ...player, ...players[id] }; // Обединява съществуващите данни
            } else {
                otherPlayers[id] = players[id]; // Запазване на другите играчи
            }
        });

        triangles = updatedTriangles; // Обновяване на триъгълниците

        // Изтриване на играчи, които вече не са в играта
        Object.keys(otherPlayers).forEach((id) => {
            if (!players[id]) {
                delete otherPlayers[id];
            }
        });

        console.log("Обновено състояние:", { player, otherPlayers, triangles });
    });

    // Съобщение за напуснал играч
    socket.on("playerLeft", (name) => {
        console.log(`Играчът ${name} напусна играта.`);
        alert(`${name} е напуснал играта.`);
    });

    // Край на играта, когато играч е изяден
    socket.on("gameOver", () => {
        console.log("Играта приключи! Ти беше изяден.");
        alert("Край на играта! Вие бяхте изядени.");
        window.location.href = "/dashboard.html"; 
    });

    // Обработване на победа в играта
    socket.on("gameWon", (winnerName) => {
        console.log(`Победител: ${winnerName}`);
        if (winnerName === player.name) {
            alert(`Поздравления, ${winnerName}! Вие спечелихте играта!`);
        } else {
            alert(`Край на играта. ${winnerName} спечели!`);
        }
        window.location.href = "/dashboard.html"; 
    });

    // Когато триъгълниците се регенерират
    socket.on("trianglesRegenerated", () => {
        console.log("Триъгълниците бяха регенерирани!");
    });

    // Действия при разкачване от сървъра
    socket.on("disconnect", () => {
        console.log("Разкачени от сървъра");
    });

    // Стартиране на игровия цикъл при свързване
    socket.on("connect", () => {
        console.log("Свързани със сървъра");
        gameLoop(); // Стартиране на цикъла на играта
    });
}

connectButton.addEventListener("click", connectToGame);
refreshButton.addEventListener("click", resetGameState);

// Функция за рисуване на кръг - играч
function drawCircle(x, y, radius, color) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.closePath();
}

// Функция за рисуване на триъгълник - храна
function drawTriangle(x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.lineTo(x + size, y + size);
    ctx.closePath();
    ctx.fillStyle = "green";
    ctx.fill();
}

// Движение на играча
let lastPlayerPosition = { x: player.x, y: player.y };
let throttleTimeout; // Ограничива честотата на изпращане на данни към сървъра

function emitPlayerMove(position) {
    if (socket && !throttleTimeout) {
        socket.emit("playerMove", position); // Изпраща текущата позиция на играча
        throttleTimeout = setTimeout(() => {
            throttleTimeout = null;
        }, 100); // Данните се изпращат само на всеки 100 милисекунди.
    }
}

function movePlayer() {
    let moved = false;

    // Проверява дали стрелките са натиснати и играча да не излезе от канваса
    if (keys["ArrowUp"] && player.y - player.radius > 0) {
        player.y -= player.speed;
        moved = true;
    }
    if (keys["ArrowDown"] && player.y + player.radius < canvas.height) {
        player.y += player.speed;
        moved = true;
    }
    if (keys["ArrowLeft"] && player.x - player.radius > 0) {
        player.x -= player.speed;
        moved = true;
    }
    if (keys["ArrowRight"] && player.x + player.radius < canvas.width) {
        player.x += player.speed;
        moved = true;
    }

    // Проверка дали има движение на играча
    if (moved && socket && (player.x !== lastPlayerPosition.x || player.y !== lastPlayerPosition.y)) {
        emitPlayerMove({ x: player.x, y: player.y }); // Изпраща новата позиция на играча към сървъра
        lastPlayerPosition = { x: player.x, y: player.y }; // Запазва текущата позиция като последна известна позиция
        //console.log(` Движение: x=${player.x}, y=${player.y}`);
    }
}

// Проверка за сблъсъци между играчи и храна
function checkCollisions() {
    // Сблъсък на играч с храна - изчислява разстоянието
    triangles.forEach((triangle, index) => {
        const dx = player.x - triangle.x;
        const dy = player.y - triangle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Проверка за сблъсъка
        if (distance < player.radius + triangle.size) {
            player.radius += 2; // Увеличава размера на играча
            triangles.splice(index, 1); // Премахна триъгълник
            console.log("Изяден триъгълник!");
            if (socket) socket.emit("triangleEaten", index); // Изпраща съобщение до сървъра, че триъгълника е изяден
        }
    });

    //Сблъсък между играчи
    Object.values(otherPlayers).forEach((other) => {
        // Изчислява разстоянието между играчите
        const dx = player.x - other.x;
        const dy = player.y - other.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < player.radius + other.radius) {
            if (player.radius > other.radius) { // Проверява дали единия играч е по-голям от другия
                player.radius += other.radius / 2; // Ако е го изяжда и уголемява размера си
                console.log(`${player.name} изяде ${other.name}!`);
                if (socket) socket.emit("playerEaten", other.id); // Премахва играча
            }
        }
    });
}

// Визуализиране на елементите върху канваса
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Изчистване на платното

    drawCircle(player.x, player.y, player.radius, player.color); // Рисуване на играча

    Object.values(otherPlayers).forEach((other) => { // Рисуване на другите играчи
        drawCircle(other.x, other.y, other.radius || 20, other.color);
    });

    triangles.forEach((triangle) => { // Рисуване на триъгълниците
        drawTriangle(triangle.x, triangle.y, triangle.size);
    });
}

// Game loop
function gameLoop() {
    movePlayer();
    checkCollisions();
    render();
    gameLoopId = requestAnimationFrame(gameLoop);
}

// Управлява натискането на клавишите за движение 
const keys = {};
window.addEventListener("keydown", (e) => (keys[e.key] = true));
window.addEventListener("keyup", (e) => (keys[e.key] = false));

gameLoop();