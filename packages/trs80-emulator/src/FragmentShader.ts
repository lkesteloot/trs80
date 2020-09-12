export default `
precision highp float;

uniform vec4 color;
varying highp vec2 ftex;
uniform sampler2D memoryImage;
uniform sampler2D fontImage;

void main() {
    // Pixel position.
    vec2 pixelPos = floor(ftex);
    
    // Character position.
    vec2 charPos = floor(pixelPos / vec2(8, 24));
    
    // Intra-character offset.
    vec2 offset = pixelPos - charPos*vec2(8, 24);
    
    float ch = floor(texture2D(memoryImage, (charPos + vec2(0.5, 0.5))/vec2(64, 16)).x*255.0);
    vec2 chPos = vec2(mod(ch, 32.0)*8.0, floor(ch/32.0)*24.0);
    
    float pixel = texture2D(fontImage, (offset + chPos)/vec2(256, 240)).x;
    
    vec3 rgb = pixel < 0.5 ? vec3(0.15, 0.22, 0.20) : vec3(1.0, 1.0, 1.0);

    gl_FragColor = vec4(rgb, 1.0);
}
`;
