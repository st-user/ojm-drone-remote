const fs = require('fs');
const homedir = require('os').homedir();

console.log(`Home directory is ${homedir}.`);

const PLACE_HOLDER = '<!-- ##GA-TrackingCodeHere## -->';
const FILE_NAME = '.mygoogleweb';
const PROP_KEY = 'googleAnalyticsId';

const toScript = id => {
    return `
        <script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
        <script>
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', '${id}');
        </script>
    `;
};

const getId = () => {
    const path = `${homedir}/${FILE_NAME}`;
    if (!fs.existsSync(path)) {
        return undefined;
    }

    const fileContent = fs.readFileSync(path, 'utf8');
    const lines = fileContent.split(/\r?\n/);
    if (lines.length === 0) {
        return undefined;
    }
    for (const line of lines) {
        const lineArr = line.split('=');
        const key = lineArr[0];
        const value = lineArr[1];
        if (key === PROP_KEY) {
            return value;
        }
    }
    return undefined;
};

const insertScript = path => {

    const id = getId();

    if (!id) {
        console.log(`There is neither ${homedir}/${FILE_NAME} file nor "${PROP_KEY}" property.`);
        return;
    }

    const fileContent = fs.readFileSync(path, 'utf8');
    const result = fileContent.replace(PLACE_HOLDER, toScript(id));
    fs.writeFileSync(path, result);
};

module.exports = insertScript;