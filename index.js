import { app, BrowserWindow, dialog, ipcMain, shell, Notification } from 'electron';
import { exec } from 'child_process';
import isElevated from 'is-elevated';

import { fileURLToPath } from 'url';
import path from 'path';
import axios from 'axios';

let win;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appVersion = app.getVersion(); // Assuming your package.json has the version of your app

// Function to fetch and display the recording software list
async function fetchRecordingSoftwareList() {
    try {
        const response = await axios.get('https://edu.tq-box.net/lang/recording-software-list.json');
        if (response.status === 200 && Array.isArray(response.data)) {
            console.log('Recording software list retrieved successfully.');
            // Convert all software names to lowercase for consistent comparison
            return response.data.map(name => name.toLowerCase());
        } else {
            throw new Error('Failed to fetch list: Response format invalid or not an array.');
        }
    } catch (error) {
        console.error('Failed to fetch recording software list:', error);
        // Return an empty array if there's an error fetching the list
        return [];
    }
}


async function createWindow() {

    // Check app version
    try {
        const { data: { version: requiredVersion } } = await axios.get('https://physics-universe.com/required-version.json');
        if (appVersion !== requiredVersion) {
            dialog.showErrorBox('Version Error', `This app version is ${appVersion}. Please update to ${requiredVersion}.`);
            return app.quit();
        }
    } catch (error) {
        console.error('Failed to fetch or compare app version:', error);
        dialog.showErrorBox('Version Check Failed', 'Could not verify app version. Please try again later.');
        return app.quit();
    }

    

    if (!(await isElevated())) {
        dialog.showErrorBox('Please Run As Administrator', 'right click on the app from programs and run as adminstrator');
        return app.quit();
    }
    const preloadPath = path.join(__dirname, 'preload.js');
    win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: preloadPath
        },
        icon: path.join(__dirname, 'build/app_icon.ico') // Adjust the path accordingly
        
    });

    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));


    win.loadURL('https://physics-universe.com/login/');
    win.webContents.on('devtools-opened', () => { win.webContents.closeDevTools(); });
    win.on('page-title-updated', evt => { evt.preventDefault(); });
    // Fetch the recording software list and check for recording software
    const recordingSoftwareList = await fetchRecordingSoftwareList();
    setInterval(() => checkForRecordingSoftware(recordingSoftwareList), 30000);
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}


// This function now uses the combined list for detection
function checkForRecordingSoftware(recordingSoftwareList) {
    setInterval(() => {
        exec('tasklist', (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                return;
            }

            recordingSoftwareList.forEach(software => {
                const regex = new RegExp(`\\b${escapeRegExp(software)}\\b`, 'gi');
                if (stdout.match(regex)) {
                    console.log(`Recording software detected: ${software}`);
                    exec(`taskkill /F /IM "${software}.exe"`, (killError, killStdout, killStderr) => {
                        if (killError) {
                            console.error(`Failed to terminate ${software}.exe: ${killError}`);
                        } else {
                            console.log(`${software}.exe has been successfully terminated.`);
                        }
                    });
                }
            });
        });
    }, 30000); // Check and attempt to close every 30 seconds
}




ipcMain.on('close-app', () => { app.quit(); });

ipcMain.on('update-title', (event, title) => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.setTitle(title);
});

ipcMain.on('show-notification', (event, { title, body }) => {
    new Notification({ title, body }).show();
});

ipcMain.handle('open-external', async (event, url) => {
    await shell.openExternal(url);
});

app.whenReady().then(async () => {    
    const recordingSoftwareList = await fetchRecordingSoftwareList();
    await checkForRecordingSoftware(recordingSoftwareList);
    // After listing all processes, create the main window
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
