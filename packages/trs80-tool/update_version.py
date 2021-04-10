import json

version = json.load(open("package.json"))["version"]
print('export const version = "' + version + '";');

