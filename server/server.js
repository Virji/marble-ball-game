const express = require("express"); // Уеб сървър за обслужване на HTTP заявки
const bodyParser = require("body-parser"); // Парсва данни от POST заявки
const bcrypt = require("bcrypt"); // Криптиране на пароли
const fs = require("fs"); // Четене/запис на файлове (използва се за потребителите)
const path = require("path"); // Работа с файлови пътища
const session = require("express-session"); // Управление на сесии на потребителите

// Създаване на сървър и работа с WebSockets
const { createServer } = require("http"); 
const { Server } = require("socket.io");

// Настройки на сървъра
const app = express(); // Инициализира Express.js приложението
const httpServer = createServer(app);
const io = new Server(httpServer); // Инициализира WebSocket сървъра
const PORT = 3000;
const USERS_FILE = path.join(__dirname, "./users.json");


app.use(bodyParser.urlencoded({ extended: true })); // Позволява на Express да обработва POST заявки
app.use(express.static(path.join(__dirname, "../public"))); //  Сървърът зарежда статични файлове
//  Съхранява информация за логнатите потребители чрез сесии
app.use( 
    session({
        secret: "secure_key",
        resave: false,
        saveUninitialized: false,
    })
);

// Променливи за съхранение 
const players = {};
let triangles = [];
const colors = ["blue", "red", "yellow", "green", "purple", "orange"]; 

// Генериране на храна - 10 на случайни места
function generateTriangles() {
    triangles = [];
    for (let i = 0; i < 10; i++) {
        triangles.push({
            x: Math.random() * 800,
            y: Math.random() * 600,
            size: 10,
        });
    }
    console.log("Triangles regenerated!");
}
generateTriangles();

// Регистрация
app.get("/register", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/register.html"));
});

// Обратва регистрационна заявка
app.post("/register", async (req, res) => {
    const { username, password } = req.body;

    // Проверява за съществуващ потребител
    const users = fs.existsSync(USERS_FILE)
        ? JSON.parse(fs.readFileSync(USERS_FILE, "utf8"))
        : [];

    // Проверява дали името съществува
    if (users.find((user) => user.username === username)) {
        return res.status(400).send("Username already exists!");
    }

    // Хеширане на паролата
    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ username, password: hashedPassword });
    fs.writeFileSync(USERS_FILE, JSON.stringify(users)); // Записване на потребителя в JSON

    req.session.username = username;
    res.redirect("/dashboard.html");
});

// Логин
app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/login.html"));
});

app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    // Зарежда потребителя от JSON
    const users = fs.existsSync(USERS_FILE)
        ? JSON.parse(fs.readFileSync(USERS_FILE, "utf8"))
        : [];

    // Търси потребителя в списъка
    const user = users.find((user) => user.username === username);
    if (!user) return res.status(400).send("Invalid username or password!");

    // Проверява паролата
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).send("Invalid username or password!");

    req.session.username = username;
    res.redirect("/dashboard.html");
});

// Главна страница - само логнати потребители имат достъп до нея
app.get("/dashboard.html", (req, res) => {
    if (!req.session.username) return res.redirect("/login");
    res.sendFile(path.join(__dirname, "../public/dashboard.html"));
});

// Връща кой е логнат
app.get("/session", (req, res) => {
    res.json({ username: req.session.username || null });
});

//app.get('/favicon.ico', (req, res) => res.status(204).end());

// Обработване на WebSocket връзките
io.on("connection", (socket) => {
    console.log(`Играч се свърза: ${socket.id}`);

    // Когато нов играч се присъедини
    socket.on("newPlayer", (playerData) => {
        // Проверяваме дали играчът вече не е регистриран
        if (!players[socket.id]) {
            // Определяме цвят за играча на базата на броя на играчите
            const colorIndex = Object.keys(players).length % colors.length;
            const color = colors[colorIndex];

            // Добавяме играча в списъка с играчи
            players[socket.id] = { ...playerData, id: socket.id, color };

            console.log(`Играчът ${playerData.name} се присъедини с цвят ${color}`);

            // Изпращаме обновено състояние на всички играчи
            io.emit("updateState", { players, triangles });
        }
    });

    // Когато играчът се премести
    socket.on("playerMove", (playerData) => {
        if (players[socket.id]) {
            // Обновяваме позицията на играча
            players[socket.id] = { ...players[socket.id], ...playerData };

            // Изпращаме обновеното състояние на всички играчи
            io.emit("updateState", { players, triangles });
        }
    });

    // Когато играч изяде триъгълник
    socket.on("triangleEaten", (index) => {
        if (triangles[index]) {
            console.log(`Играчът ${players[socket.id]?.name} изяде триъгълник!`);

            // Премахваме триъгълника от масива
            triangles.splice(index, 1);

            // Увеличаваме радиуса на играча, ако той съществува
            if (players[socket.id]) {
                players[socket.id].radius += 2;
            }

            // Ако всички триъгълници са изядени, генерираме нови
            if (triangles.length === 0) {
                generateTriangles();
            }

            // Изпращаме обновеното състояние на всички играчи
            io.emit("updateState", { players, triangles });
        }
    });

    // Когато играч изяде друг играч
    socket.on("playerEaten", (eatenPlayerId) => {
        if (players[eatenPlayerId] && players[socket.id]) {
            console.log(`${players[socket.id]?.name} изяде ${players[eatenPlayerId]?.name}!`);

            // Поглъщащият играч увеличава радиуса си с половината от радиуса на изядения играч
            players[socket.id].radius += players[eatenPlayerId].radius / 2;

            // Изпращаме съобщение до изядения играч, че играта му е приключила
            io.to(eatenPlayerId).emit("gameOver");

            // Премахваме изядения играч от списъка с активни играчи
            delete players[eatenPlayerId];

            // Проверяваме дали е останал само един играч (т.е. имаме победител)
            if (Object.keys(players).length === 1) {
                const winnerId = Object.keys(players)[0];
                const winnerName = players[winnerId].name;
                console.log(`Играта беше спечелена от: ${winnerName}`);

                // Изпращаме съобщение до победителя
                io.to(winnerId).emit("gameWon", winnerName);
            }

            // Изпращаме обновено състояние на всички играчи
            io.emit("updateState", { players, triangles });
        }
    });

    // Когато играч напусне играта
    socket.on("disconnect", () => {
        const leavingPlayer = players[socket.id];

        if (leavingPlayer) {
            console.log(`Играчът ${leavingPlayer.name} напусна играта.`);

            // Премахваме играча от списъка с активни играчи
            delete players[socket.id];

            // Уведомяваме останалите играчи, че този играч е напуснал
            socket.broadcast.emit("playerLeft", leavingPlayer.name);
        }

        // Проверяваме дали е останал само един играч (ако да – той печели)
        if (Object.keys(players).length === 1) {
            const winnerId = Object.keys(players)[0];
            const winnerName = players[winnerId].name;

            // Изпращаме съобщение до победителя
            io.to(winnerId).emit("gameWon", winnerName);
        }

        // Изпращаме обновено състояние на всички играчи
        io.emit("updateState", { players, triangles });
    });
});

// Стартиране на сървъра - node server/server.js
httpServer.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});