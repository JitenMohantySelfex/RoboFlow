 const fs = require("fs")
 
 const imageDataArray = JSON.parse(fs.readFileSync('./images.json', 'utf8'));

 console.log(imageDataArray.length)