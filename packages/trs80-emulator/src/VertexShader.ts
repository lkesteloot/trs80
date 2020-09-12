export default `

attribute highp vec4 pos;
attribute highp vec2 vtex;
varying highp vec2 ftex;

void main()
{
    gl_Position = pos;
    ftex = vtex;
}
`
