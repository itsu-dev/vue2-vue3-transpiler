import {parseComponent} from "vue-sfc-parser";
import fs from "fs";
import processStyle from "./processor/style";
import processTemplate from "./processor/template";
import processScript from "./processor/script";

const writeFile = (filePath: string, content: string) => {
    fs.writeFileSync(filePath, content, {flag: 'a'});
}

const writeReturn2 = (filePath: string) => {
    fs.writeFileSync(filePath, '\n\n', {flag: 'a'});
}

const processFile = (filePath: string) => {
    const fileName = filePath.split('/').at(-1)!;
    if (!fileName.endsWith('.vue')) {
        return;
    }

    const newFilePath = filePath.split('/').slice(0, -1).join('/') + '/'
        + fileName.replace('.vue', '.new.vue');

    if (fs.existsSync(newFilePath)) {
        fs.unlinkSync(newFilePath);
    }

    console.log(filePath);

    const input = fs.readFileSync(filePath).toString();
    const res = parseComponent(input);

    // Write <template>
    if (res.template) {
        writeFile(newFilePath, processTemplate(res.template));
        writeReturn2(newFilePath);
    }

    // Write <script>
    if (res.script) {
        writeFile(newFilePath, processScript(res.script));
        writeReturn2(newFilePath);
    }

    // Write <style>
    for (const style of res.styles) {
        writeFile(newFilePath, processStyle(style));
        writeReturn2(newFilePath);
    }
}

const main = (path: string) => {
    const stats = fs.statSync(path);
    if (stats.isFile()) {
        processFile(path);
    } else {
        const names = fs.readdirSync(path);
        for (const name of names) {
            main(path + '/' + name);
        }
    }
}

const path = process.argv[2];
if (!path) {
    console.error('Please provide a path to a file or directory.');
    process.exit(1);
}

main(path);