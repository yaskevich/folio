'use strict';

const fs = require('fs');
const path = require('path');
const mustache = require('mustache');
const express = require('express');

const port = 3210;
const TMPL = 'template.html';
const PRJ = 'projects.json'
render();


function render() {
    const rawdata = fs.readFileSync(PRJ);
    const projects = JSON.parse(rawdata);
    // console.log(projects);
    const template = fs.readFileSync(TMPL, 'utf8');
    // console.log(template);
    const rendered_sse = mustache.render(template, projects);
    // console.log(rendered);
	projects["index"] = true;
	const rendered = mustache.render(template, projects);
    fs.writeFileSync('sse.html', rendered_sse, 'utf8');
    fs.writeFileSync('index.html', rendered, 'utf8');
	console.log('Page was generated succesfully');
}

const mode = process.argv[2];

if (mode) {
	if (mode === 'app')	{
		const app = express();
		app.use('/images', express.static('res'));
		app.use(express.static('icons'));
		let client = null;

		app.get('/subscribe', async function(req, res) {
			console.log('browser connected');
			// alternative is https://www.npmjs.com/package/lite-server
			res.set({
				'Cache-Control': 'no-cache',
				'Content-Type': 'text/event-stream',
				'Connection': 'keep-alive'
			});
			res.flushHeaders();

			// Tell the client to retry every if connectivity is lost
			res.write('retry: 1000\n\n');

			client = res;

			req.on('close', () => {
				client = null;
				res.end();
			})

			// res.write(`data: hi\n\n`);
			// while (true) {
			// await new Promise(resolve => setTimeout(resolve, 1000));

			// console.log('Emit', ++count);
			// // Emit an SSE that contains the current 'count' as a string
			// res.write(`data: ${count}\n\n`);
			// }
		});

		app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'sse.html')));
		app.listen(port);
		
		console.log(`Listening on port ${port}`);
		console.log(`Monitoring directory ${__dirname}`);
		let watching = false;
		fs.watch(__dirname, (eventType, filename) => {
			// console.log(eventType, filename);
			if (eventType === "change" && [PRJ, TMPL].includes(filename)) {
				// I observed duplicate events for one change on Microsoft Windows, so I use workaround by Lasse Brustad
				// https://stackoverflow.com/questions/12978924/fs-watch-fired-twice-when-i-change-the-watched-file/33047844
				if (watching) return;
				watching = true;
				console.log(`Updated: ${filename}`);

				Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
				
				setTimeout(() => {
					watching = false;
					
					
					let json = '';
					try {
						json = JSON.parse(fs.readFileSync(PRJ));
					} catch (e) {
						console.log("Fix JSON issue:", e.message);
					} 
					if (json) {
						const rendered = mustache.render(fs.readFileSync(TMPL, 'utf8'), json);
						if (client) {
							client.write('data: ' + rendered.replace(/(\r\n|\n|\r)/gm, "") + '\n\n');
						} else {
							console.log("Server was restarted, but outdated page left in browser");
						}
						fs.writeFileSync('index.html', rendered, 'utf8');					
					}
				}, 100);
			}
		})
	} else {
		console.log(`Unknown argument provided: ${mode}`);
		console.log(`With "app" argument (no quotation marks) the page generator will be started as a server with in-browser hot reloading`);
	}
}