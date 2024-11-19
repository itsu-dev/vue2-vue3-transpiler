import fs from "fs";
import child_process from 'child_process';
import scriptProcessor from './processor/script';

const processor = scriptProcessor();

const main = (path: string) => {
    const stats = fs.statSync(path);
    if (stats.isFile()) {
        processor.processFile(path);
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

const backupPath = `${path}_backup`;
const isDirectory = fs.statSync(path).isDirectory();
if (fs.existsSync(backupPath)) {
    if (isDirectory) {
        child_process.execSync(`rm -rf ${backupPath}`);
    } else {
        fs.unlinkSync(backupPath);
    }
}

child_process.execSync(`cp ${isDirectory ? '-r ' : ''}${path} ${backupPath}`);

main(path);

console.log(processor.processedFiles);