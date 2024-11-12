import {SFCBlock} from "vue-sfc-parser";

export default function processStyle(block: SFCBlock): string {
    let document = '<style';

    // Add attributes
    Object.entries(block.attrs).forEach(([key, value]) => {
        if (value === true) {
            document += ` ${key}`;
        } else {
            document += ` ${key}="${value}"`;
        }
    });

    document += '>';
    document += block.content;
    document += '</style>';

    return document;
}