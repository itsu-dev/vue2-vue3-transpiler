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

    console.log(filePath);

    const input = fs.readFileSync(filePath).toString();
    const res = parseComponent(input);

    // Write <script>
    if (res.script) {
        // if there is no templates, then this file is regarded as Mixin
        const isMixin = res.template == null;

        const script = processScript(res.script, isMixin);
        if (script == null) {
            return;
        }

        // remove the old file
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Write <template>
        if (res.template) {
            writeFile(filePath, processTemplate(res.template));
            writeReturn2(filePath);
        }

        // write <script>
        writeFile(filePath, script);
        writeReturn2(filePath);

        // Write <style>
        for (const style of res.styles) {
            writeFile(filePath, processStyle(style));
            writeReturn2(filePath);
        }
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