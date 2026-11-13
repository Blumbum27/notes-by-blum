// Test the delivered preview's actual script, including its UI event handlers.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '../previews/paper-gallery.html'), 'utf8');
const source = html.split('<script>')[1].split('</script>')[0];
const pure = { module: { exports: {} } };
vm.runInNewContext(source, pure);
const engine = pure.module.exports;
let checked = 0;
for (const layout of engine.layouts) for (const color of engine.palette)
for (const format of Object.keys(engine.formats)) for (const landscape of [false, true])
for (const [spacing, margin] of [[16,64], [24,30], [48,16]]) {
    const svg = engine.paperSVG(layout, { color: color.id, format, landscape, spacing, margin });
    assert(svg.endsWith('</svg>') && !/NaN|Infinity|undefined/.test(svg));
    checked++;
}
class Element {
    constructor() { this.value = ''; this.children = []; this.attributes = {}; this.style = {}; this.content = ''; }
    set innerHTML(value) { this.content = value; this.children = []; }
    get innerHTML() { return this.content; }
    setAttribute(key, value) { this.attributes[key] = value; }
    appendChild(child) { this.children.push(child); }
}
const elements = {};
for (const match of html.matchAll(/\bid="([^"]+)"/g)) elements[match[1]] = new Element();
Object.assign(elements.format, { value: 'a4' });
Object.assign(elements.orientation, { value: 'portrait' });
Object.assign(elements.spacing, { value: '24' });
Object.assign(elements.margin, { value: '30' });
const document = {
    getElementById(id) { assert(elements[id], `Missing actual element: ${id}`); return elements[id]; },
    createElement() { return new Element(); }
};
vm.runInNewContext(source, { document, module: { exports: {} } });
assert.equal(elements.gallery.children.length, 12);
assert.equal(elements.colors.children.length, 5);
assert.equal(elements.name.textContent, 'Конспект Cornell');
elements.format.value = 'a5'; elements.format.oninput();
assert(elements.large.innerHTML.includes('viewBox="0 0 420 595"'));
elements.orientation.value = 'landscape'; elements.orientation.oninput();
assert(elements.large.innerHTML.includes('viewBox="0 0 595 420"'));
elements.colors.children.find(e => e.attributes['aria-label'] === 'Голубой').onclick();
assert(elements.large.innerHTML.includes('rgb(224,240,255)'));
elements.gallery.children[11].onclick();
assert.equal(elements.name.textContent, 'Раскадровка');
elements.spacing.value = '48'; elements.spacing.oninput();
assert.equal(elements.spacingValue.value, 48);
console.log(`PASS: ${checked} SVG variants; preview controls for format, orientation, color, layout and density.`);
console.log('NOT TESTED: browser layout, UIKit rendering or iOS app execution.');
