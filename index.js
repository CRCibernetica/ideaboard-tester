const BAUD_RATE = 115200;
const MAX_DATA_POINTS = 60; // 30 seconds ÷ 0.5 seconds per point = 60 points
const MAX_SERIES = 6; // Maximum of 6 data series

const log = document.getElementById("log");
const butConnect = document.getElementById("butConnect");
const butStart = document.getElementById("butStart");
const butReset = document.getElementById("butReset");

let port = null;
let reader = null;
let isMonitoring = false;
let buffer = "";

let chart = null;
const sensorData = {
    labels: [],
    series: {}
};

const COLORS = [
    '#e74c3c', // Red
    '#3498db', // Blue
    '#2ecc71', // Green
    '#f1c40f', // Yellow
    '#9b59b6', // Purple
    '#e67e22'  // Orange
];

function initializeChart() {
    const canvas = document.getElementById('sensorChart');
    if (!canvas) {
        console.error('Canvas element not found!');
        return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Failed to get 2D context for canvas!');
        return;
    }

    console.log('Initializing chart...');
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sensorData.labels,
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                x: { display: true, title: { display: true, text: 'Time (30s window)' } },
                y: { 
                    display: true, 
                    title: { display: true, text: 'Value' }
                }
            }
        }
    });
    console.log('Chart initialized:', chart);
}

document.addEventListener("DOMContentLoaded", () => {
    butConnect.addEventListener("click", clickConnect);
    butStart.addEventListener("click", clickStart);
    butReset.addEventListener("click", resetChartData);

    // Add toggle for Data Format link
    const dataFormatLink = document.getElementById("dataFormatLink");
    const dataFormatText = document.getElementById("dataFormatText");
    dataFormatLink.addEventListener("click", () => {
        if (dataFormatText.style.display === "none" || dataFormatText.style.display === "") {
            dataFormatText.style.display = "block";
        } else {
            dataFormatText.style.display = "none";
        }
    });

    initializeChart();

    if ("serial" in navigator) {
        document.getElementById("notSupported").style.display = "none";
    } else {
        console.warn('Web Serial API not supported');
    }

    logLine("Ideaboard Serial Monitor loaded.");
});

// Rest of your index.js remains unchanged...

function cleanSerialOutput(text) {
    console.log('Raw buffer:', text);
    text = text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
               .replace(/\x1B\]0;.*?\x07/g, '')
               .replace(/\x1B\]0;.*?\x5C/g, '')
               .replace(/\x1B\]0;.*?[\x07\x5C]/g, '');
    text = text.replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, '');
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '').trim();
}

function parseSensorData(line) {
    console.log('Parsing line:', line);
    const sensors = {};
    const pairs = line.split(',').map(pair => pair.trim());
    pairs.forEach(pair => {
        const match = pair.match(/([a-zA-Z_][a-zA-Z0-9_]*):(-?[\d.]+)/); // Python variable name rules
        if (match) {
            const [, tag, value] = match;
            sensors[tag] = parseFloat(value);
            console.log(`Matched pair: ${pair} -> tag: ${tag}, value: ${value}`);
        } else {
            console.warn(`Failed to parse pair: ${pair}`);
        }
    });
    console.log('Parsed sensors:', sensors);
    return sensors;
}

function updateChart(sensors) {
    console.log('Updating chart with:', sensors);
    if (!chart) {
        console.error('Chart not initialized!');
        return;
    }

    sensorData.labels.push(new Date().toLocaleTimeString());

    Object.keys(sensors).forEach(tag => {
        if (!sensorData.series[tag]) {
            if (Object.keys(sensorData.series).length < MAX_SERIES) {
                sensorData.series[tag] = [];
                const colorIndex = chart.data.datasets.length % COLORS.length;
                chart.data.datasets.push({
                    label: tag,
                    data: sensorData.series[tag],
                    borderColor: COLORS[colorIndex],
                    fill: false,
                    tension: 0.1
                });
                console.log(`Added new series: ${tag} with color ${COLORS[colorIndex]}`);
            } else {
                console.warn(`Max series limit (${MAX_SERIES}) reached; ignoring ${tag}`);
                return;
            }
        }
        sensorData.series[tag].push(sensors[tag]);
    });

    Object.keys(sensorData.series).forEach(tag => {
        if (!(tag in sensors)) {
            sensorData.series[tag].push(null);
        }
    });

    if (sensorData.labels.length > MAX_DATA_POINTS) {
        sensorData.labels.shift();
        Object.keys(sensorData.series).forEach(tag => {
            sensorData.series[tag].shift();
        });
    }

    chart.data.labels = sensorData.labels;
    chart.data.datasets.forEach(dataset => {
        dataset.data = sensorData.series[dataset.label];
    });

    chart.update();
    console.log('Chart data length:', sensorData.labels.length);
}

function resetChartData() {
    sensorData.labels = [];
    sensorData.series = {};
    chart.data.labels = sensorData.labels;
    chart.data.datasets = [];
    chart.update();
    logLine("Chart data reset.");
}

document.addEventListener("DOMContentLoaded", () => {
    butConnect.addEventListener("click", clickConnect);
    butStart.addEventListener("click", clickStart);
    butReset.addEventListener("click", resetChartData);

    initializeChart();

    if ("serial" in navigator) {
        document.getElementById("notSupported").style.display = "none";
    } else {
        console.warn('Web Serial API not supported');
    }

    logLine("Ideaboard Serial Monitor loaded.");
});

function logLine(text) {
    const line = document.createElement("div");
    line.textContent = text;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
}

function logError(text) {
    const line = document.createElement("div");
    line.innerHTML = `<span style="color: red;">Error: ${text}</span>`;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
}

async function clickConnect() {
    if (port) {
        if (isMonitoring) {
            await stopMonitoring();
        }
        try {
            await port.close();
            port = null;
            toggleUI(false);
            logLine("Disconnected from serial port.");
        } catch (e) {
            logError(`Disconnect failed: ${e.message}`);
        }
        return;
    }

    try {
        port = await navigator.serial.requestPort({});
        toggleUI(true);
        logLine("Connected to serial port.");
    } catch (e) {
        logError(`Failed to connect: ${e.message}`);
        port = null;
        toggleUI(false);
    }
}

async function clickStart() {
    if (isMonitoring) {
        await stopMonitoring();
        return;
    }

    if (!port) {
        logError("Please connect to a serial port first.");
        return;
    }

    try {
        await port.open({ baudRate: BAUD_RATE });
        logLine(`Started monitoring at ${BAUD_RATE} baud. Click Stop to end.`);

        isMonitoring = true;
        butStart.textContent = "Stop";
        butStart.style.backgroundColor = "#e74c3c";

        buffer = "";

        const decoder = new TextDecoder();
        reader = port.readable.getReader();

        while (isMonitoring) {
            const { value, done } = await reader.read();
            if (done) {
                logLine("Serial stream ended.");
                break;
            }
            
            if (!value) continue;

            const text = decoder.decode(value);
            console.log('Received text:', text);
            buffer += text;

            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.substring(0, newlineIndex);
                const cleanedLine = cleanSerialOutput(line);
                buffer = buffer.substring(newlineIndex + 1);

                if (cleanedLine) {
                    logLine(cleanedLine);
                    const sensors = parseSensorData(cleanedLine);
                    if (Object.keys(sensors).length > 0) {
                        updateChart(sensors);
                    } else {
                        console.warn('No valid sensor data parsed:', cleanedLine);
                    }
                }
            }
        }
    } catch (e) {
        logError(`Monitoring failed: ${e.message}`);
    } finally {
        await stopMonitoring();
    }
}

async function stopMonitoring() {
    isMonitoring = false;
    butStart.textContent = "Start";
    butStart.style.backgroundColor = "";

    try {
        if (reader) {
            try {
                await reader.cancel();
            } catch (e) {
                console.warn('Failed to cancel reader:', e.message);
            }
            try {
                if (typeof reader.releaseLock === 'function') {
                    reader.releaseLock();
                }
            } catch (e) {
                console.warn('Failed to release lock:', e.message);
            }
            reader = null;
        }

        if (port && port.readable) {
            try {
                await port.close();
            } catch (e) {
                console.warn('Failed to close port:', e.message);
            }
        }
        logLine("Stopped monitoring serial port.");
    } catch (e) {
        logError(`Failed to stop monitoring: ${e.message}`);
    }
}

function toggleUI(connected) {
    butConnect.textContent = connected ? "Disconnect" : "Connect";
    butStart.disabled = !connected;
    butReset.disabled = !connected;
}