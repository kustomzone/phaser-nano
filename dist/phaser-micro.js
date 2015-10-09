/**
* @author       Richard Davey @photonstorm
* @author       Mat Groves @Doormat23
* @copyright    2015 Photon Storm Ltd.
* @license      {@link https://github.com/photonstorm/phaser/blob/master/license.txt|MIT License}
*/

(function(){

    var root = this;

/**
* @author       Richard Davey @photonstorm
* @copyright    2015 Photon Storm Ltd.
* @license      {@link https://github.com/photonstorm/phaser/blob/master/license.txt|MIT License}
*/

var PhaserMicro = PhaserMicro || {};

PhaserMicro.VERSION = '1.0.0';

PhaserMicro.BLEND_NORMAL = 0;
PhaserMicro.BLEND_ADD = 1;
PhaserMicro.BLEND_MULTIPLY = 2;
PhaserMicro.BLEND_SCREEN = 3;

PhaserMicro.LINEAR = 0;
PhaserMicro.NEAREST = 1;

PhaserMicro.PI_2 = Math.PI * 2;
PhaserMicro.RAD_TO_DEG = 180 / Math.PI;
PhaserMicro.DEG_TO_RAD = Math.PI / 180;

PhaserMicro.showLog = true;

PhaserMicro.log = function (text, color, bg) {

    if (!PhaserMicro.showLog)
    {
        return;
    }

    if (color === undefined) { color: '#000000'; }
    if (bg === undefined) { bg: '#ffffff'; }

    text = '%c' + text;

    var style = 'color: ' + color + '; background: ' + bg;

    console.log.apply(console, [text, style]);

};

PhaserMicro.Game = function (width, height, renderer, parent, state) {

    PhaserMicro.log('/// PhaserMicro v1.0 ///', '#91c6fa', '#0054a6');

    this.parent = parent || '';
    this.width = width || 800;
    this.height = height || 600;

    this.isBooted = false;

    this.canvas = null;
    this.context = null;

    this.state = state;

    this.pixelArt = false;

    this.cache = null;
    this.load = null;
    this.renderer = null;

    //  Move to World?
    this.children = [];
    // this.worldAlpha = 1;
    // this.worldTransform = new PhaserMicro.Matrix();

    this.boot();

};

PhaserMicro.Game.prototype = {

    boot: function () {

        if (this.isBooted)
        {
            return;
        }

        var check = this.boot.bind(this);

        if (document.readyState === 'complete' || document.readyState === 'interactive')
        {
            if (!document.body)
            {
                window.setTimeout(check, 20);
            }
            else
            {
                document.removeEventListener('deviceready', check);
                document.removeEventListener('DOMContentLoaded', check);
                window.removeEventListener('load', check);

                this.isBooted = true;

                this.init();
            }
        }
        else
        {
            document.addEventListener('DOMContentLoaded', check, false);
            window.addEventListener('load', check, false);
        }

    },

    init: function () {

        this.cache = new PhaserMicro.Cache(this);
        this.load = new PhaserMicro.Loader(this);

        //  Create the Canvas

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        //  TODO: WebGL / Canvas switch
        this.renderer = new PhaserMicro.WebGL(this);
        this.renderer.boot();

        this.addToDOM();

        if (this.state.preload)
        {
            this.state.preload.call(this.state, this);

            //  Empty loader?
            if (this.load._totalFileCount === 0)
            {
                this.start();
            }
            else
            {
                this.load.start();
            }
        }
        else
        {
            this.start();
        }

    },

    start: function () {

        if (this.state.create)
        {
            this.state.create.call(this.state, this);
        }

        window.requestAnimationFrame(this.update.bind(this));

    },

    update: function () {

        if (this.state.update)
        {
            this.state.update.call(this.state, this);
        }

        this.renderer.render();

        if (this.frameCount < 1)
        {
            window.requestAnimationFrame(this.update.bind(this));
            this.frameCount++;
        }

        // window.requestAnimationFrame(this.update.bind(this));

    },

    addToDOM: function () {

        var target;

        if (this.parent)
        {
            if (typeof this.parent === 'string')
            {
                // hopefully an element ID
                target = document.getElementById(this.parent);
            }
            else if (typeof this.parent === 'object' && this.parent.nodeType === 1)
            {
                // quick test for a HTMLelement
                target = this.parent;
            }
        }

        // Fallback, covers an invalid ID and a non HTMLelement object
        if (!target)
        {
            target = document.body;
        }

        target.appendChild(this.canvas);

    },

    addChild: function (x, y, key) {

        var sprite = new PhaserMicro.Sprite(this, x, y, key);

        sprite.parent = this.renderer;

        this.children.push(sprite);

        return sprite;

    }

};

/**
* @author       Richard Davey @photonstorm
* @author       Mat Groves @Doormat23
* @copyright    2015 Photon Storm Ltd.
* @license      {@link https://github.com/photonstorm/phaser/blob/master/license.txt|MIT License}
*/

PhaserMicro.WebGL = function (game) {

    this.game = game;
    this.canvas = game.canvas;

    this.gl = null;

    //  WebGL Properties

    //  limit frames rendered
    this.frameCount = 0;

    this.contextOptions = {
        alpha: false,
        antialias: true,
        premultipliedAlpha: false,
        stencil: false,
        preserveDrawingBuffer: false
    };

    this.worldAlpha = 1;
    this.worldTransform = new PhaserMicro.Matrix();

    this.projection = { x: 0, y: 0 };
    this.offset = { x: 0, y: 0 };
    this.drawCount = 0;
    this.vertSize = 6;
    this.stride = this.vertSize * 4;
    this.batchSize = 2000;
    this.batchSprites = [];
    this.contextLost = false;
    this.vertices = new Float32Array(this.batchSize * 4 * this.vertSize);
    this.indices = new Uint16Array(this.batchSize * 6);
    this.lastIndexCount = 0;
    this.drawing = false;
    this.currentBatchSize = 0;
    this.currentBaseTexture = null;
    this.dirty = true;
    this.textures = [];
    this._UID = 0;

};

PhaserMicro.WebGL.prototype = {

    boot: function () {

        this.contextLostBound = this.handleContextLost.bind(this);
        this.contextRestoredBound = this.handleContextRestored.bind(this);

        this.canvas.addEventListener('webglcontextlost', this.contextLostBound, false);
        this.canvas.addEventListener('webglcontextrestored', this.contextRestoredBound, false);

        var gl = this.canvas.getContext('webgl', this.contextOptions) || this.canvas.getContext('experimental-webgl', this.contextOptions);

        this.gl = gl;

        if (!gl)
        {
            throw new Error('Browser does not support WebGL');
        }

        gl.id = 0;

        PhaserMicro.log('initWebGL ' + gl.id);

        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.BLEND);

        this.gl.viewport(0, 0, this.game.width, this.game.height);

        this.projection.x =  this.game.width / 2;
        this.projection.y =  -this.game.height / 2;

        for (var i = 0, j = 0; i < (this.batchSize * 6); i += 6, j += 4)
        {
            this.indices[i + 0] = j + 0;
            this.indices[i + 1] = j + 1;
            this.indices[i + 2] = j + 2;
            this.indices[i + 3] = j + 0;
            this.indices[i + 4] = j + 2;
            this.indices[i + 5] = j + 3;
        }

        this.vertexBuffer = gl.createBuffer();
        this.indexBuffer = gl.createBuffer();

        // 65535 is max index, so 65535 / 6 = 10922.

        //  Upload the index data
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices, gl.STATIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.vertices, gl.DYNAMIC_DRAW);

        this.initShader();

    },

    initShader: function () {

        PhaserMicro.log('initShader', '#ffffff', '#ff0000');

        var gl = this.gl;

        var vertexSrc = [
            'attribute vec2 aVertexPosition;',
            'attribute vec2 aTextureCoord;',
            'attribute vec4 aColor;',

            'uniform vec2 projectionVector;',

            'varying vec2 vTextureCoord;',
            'varying vec4 vColor;',

            'const vec2 center = vec2(-1.0, 1.0);',

            'void main(void) {',
            '   gl_Position = vec4((aVertexPosition / projectionVector) + center, 0.0, 1.0);',
            '   vTextureCoord = aTextureCoord;',
            '   vec3 color = mod(vec3(aColor.y / 65536.0, aColor.y / 256.0, aColor.y), 256.0) / 256.0;',
            '   vColor = vec4(color * aColor.x, aColor.x);',
            '}'
        ];

        var fragmentSrc = [
            'precision lowp float;',
            'varying vec2 vTextureCoord;',
            'varying vec4 vColor;',
            'uniform sampler2D uSampler;',
            'void main(void) {',
            '   gl_FragColor = texture2D(uSampler, vTextureCoord) * vColor ;',
            '}'
        ];

        var fragmentShader = this.compileShader(fragmentSrc, gl.FRAGMENT_SHADER);
        var vertexShader = this.compileShader(vertexSrc, gl.VERTEX_SHADER);
        var program = gl.createProgram();

        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        {
            PhaserMicro.log("Could not initialise shaders");
            return false;
        }
        else
        {
            //  Set Shader
            gl.useProgram(program);

            //  vertex position
            gl.enableVertexAttribArray(0);

            //  texture coordinate
            gl.enableVertexAttribArray(1);

            //  color attribute
            gl.enableVertexAttribArray(2);

            //  Shader uniforms
            this.uSampler = gl.getUniformLocation(program, 'uSampler');
            this.projectionVector = gl.getUniformLocation(program, 'projectionVector');
            // this.offsetVector = gl.getUniformLocation(program, 'offsetVector');
            this.dimensions = gl.getUniformLocation(program, 'dimensions');

            this.program = program;

            return true;
        }

    },

    compileShader: function (src, type) {

        var gl = this.gl;
        var src = src.join("\n");
        var shader = gl.createShader(type);
        gl.shaderSource(shader, src);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        {
            return null;
        }

        return shader;

    },

    render: function () {

        if (this.contextLost)
        {
            return;
        }

        var gl = this.gl;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        //  Transparent
        // gl.clearColor(0, 0, 0, 0);

        //  Black
        gl.clearColor(0, 0, 0, 1);

        gl.clear(gl.COLOR_BUFFER_BIT);

        this.drawCount = 0;
        this.currentBatchSize = 0;
        this.batchSprites = [];

        // PhaserMicro.log('renderWebGL start', '#ff0000');

        this.dirty = true;

        var sprite;

        for (var i = 0; i < this.game.children.length; i++)
        {
            sprite = this.game.children[i];

            sprite.updateTransform();

            if (sprite.visible && sprite.worldAlpha > 0)
            {
                this.renderSprite(sprite);
            }
        }

        // PhaserMicro.log('renderWebGL end', '#ff0000');

        this.flushBatch();

    },

    renderSprite: function (sprite) {

        // PhaserMicro.log('renderSprite');

        var texture = sprite.texture;
        
        if (this.currentBatchSize >= this.batchSize)
        {
            // PhaserMicro.log('flush 1');
            this.flushBatch();
            this.currentBaseTexture = texture.baseTexture;
        }

        // get the uvs for the texture

        var uvs = texture._uvs;

        // get the sprites current alpha
        var alpha = sprite.worldAlpha;
        var tint = sprite.tint;

        var verticies = this.vertices;

        //  anchor
        var aX = sprite.anchor.x;
        var aY = sprite.anchor.y;

        var w0 = (texture.frame.width) * (1 - aX);
        var w1 = (texture.frame.width) * -aX;

        var h0 = texture.frame.height * (1 - aY);
        var h1 = texture.frame.height * -aY;

        /*
        if (texture.trim)
        {
            // if the sprite is trimmed then we need to add the extra space before transforming the sprite coords..
            var trim = texture.trim;

            w1 = trim.x - aX * trim.width;
            w0 = w1 + texture.crop.width;

            h1 = trim.y - aY * trim.height;
            h0 = h1 + texture.crop.height;

        }
        else
        {
            w0 = (texture.frame.width ) * (1-aX);
            w1 = (texture.frame.width ) * -aX;

            h0 = texture.frame.height * (1-aY);
            h1 = texture.frame.height * -aY;
        }
        */

        var index = this.currentBatchSize * 4 * this.vertSize;
        
        var worldTransform = sprite.worldTransform;

        var a = worldTransform.a;
        var b = worldTransform.b;
        var c = worldTransform.c;
        var d = worldTransform.d;
        var tx = worldTransform.tx;
        var ty = worldTransform.ty;

        //  Top Left vert
        // xy
        verticies[index++] = a * w1 + c * h1 + tx;
        verticies[index++] = d * h1 + b * w1 + ty;
        // uv
        verticies[index++] = uvs.x0;
        verticies[index++] = uvs.y0;
        // color
        verticies[index++] = alpha;
        verticies[index++] = tint;

        //  Top Right vert
        // xy
        verticies[index++] = a * w0 + c * h1 + tx;
        verticies[index++] = d * h1 + b * w0 + ty;
        // uv
        verticies[index++] = uvs.x1;
        verticies[index++] = uvs.y1;
        // color
        verticies[index++] = alpha;
        verticies[index++] = tint;

        //  Bottom Right vert
        // xy
        verticies[index++] = a * w0 + c * h0 + tx;
        verticies[index++] = d * h0 + b * w0 + ty;
        // uv
        verticies[index++] = uvs.x2;
        verticies[index++] = uvs.y2;
        // color
        verticies[index++] = alpha;
        verticies[index++] = tint;

        //  Bottom Left vert
        // xy
        verticies[index++] = a * w1 + c * h0 + tx;
        verticies[index++] = d * h0 + b * w1 + ty;
        // uv
        verticies[index++] = uvs.x3;
        verticies[index++] = uvs.y3;
        // color
        verticies[index++] = alpha;
        verticies[index++] = tint;
        
        // PhaserMicro.log('added to batch array');

        // increment the batchsize
        this.batchSprites[this.currentBatchSize++] = sprite;

    },

    flushBatch: function () {

        if (this.currentBatchSize === 0)
        {
            //  Nothing more to draw
            return;
        }

        PhaserMicro.log('flush');

        var gl = this.gl;

        if (this.dirty)
        {
            //  Always dirty the first pass through
            //  but subsequent calls may be clean
            PhaserMicro.log('flush dirty');

            this.dirty = false;

            // bind the main texture
            gl.activeTexture(gl.TEXTURE0);

            // bind the buffers
            gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

            //  set the projection vector (done every loop)
            gl.uniform2f(this.projectionVector, this.projection.x, this.projection.y);

            //  vertex position
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, this.stride, 0);

            //  texture coordinate
            gl.vertexAttribPointer(1, 2, gl.FLOAT, false, this.stride, 2 * 4);

            //  color attribute
            gl.vertexAttribPointer(2, 2, gl.FLOAT, false, this.stride, 4 * 4);
        }

        //  Upload the verts to the buffer
        if (this.currentBatchSize > (this.batchSize * 0.5))
        {
            // PhaserMicro.log('flush verts 1');
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices);
        }
        else
        {
            // PhaserMicro.log('flush verts 2');
            var view = this.vertices.subarray(0, this.currentBatchSize * 4 * this.vertSize);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, view);
        }

        var nextTexture = null;
        var nextBlendMode = null;
        var batchSize = 0;
        var start = 0;
        var currentBaseTexture = { source: null };
        var currentBlendMode = -1;
        var sprite;

        for (var i = 0, j = this.currentBatchSize; i < j; i++)
        {
            sprite = this.batchSprites[i];

            nextTexture = sprite.texture.baseTexture;
            nextBlendMode = sprite.blendMode;

            if (currentBlendMode !== nextBlendMode)
            {
                if (nextBlendMode === PhaserMicro.BLEND_NORMAL)
                {
                    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                }
                else if (nextBlendMode === PhaserMicro.BLEND_ADD)
                {
                    gl.blendFunc(gl.SRC_ALPHA, gl.DST_ALPHA);
                }
                else if (nextBlendMode === PhaserMicro.BLEND_MULTIPLY)
                {
                    gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
                }
                else if (nextBlendMode === PhaserMicro.BLEND_SCREEN)
                {
                    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
                }
            }

            if (currentBaseTexture.source !== nextTexture.source)
            {
                PhaserMicro.log('texture !== next');

                if (batchSize > 0)
                {
                    console.log('draw1', batchSize);
                    gl.bindTexture(gl.TEXTURE_2D, currentBaseTexture._gl[gl.id]);
                    gl.drawElements(gl.TRIANGLES, batchSize * 6, gl.UNSIGNED_SHORT, start * 6 * 2);
                    this.drawCount++;
                }

                start = i;
                batchSize = 0;
                currentBaseTexture = nextTexture;
            }

            batchSize++;
        }

        if (batchSize > 0)
        {
            console.log('draw2', batchSize);
            gl.bindTexture(gl.TEXTURE_2D, currentBaseTexture._gl[gl.id]);
            gl.drawElements(gl.TRIANGLES, batchSize * 6, gl.UNSIGNED_SHORT, start * 6 * 2);
            this.drawCount++;
        }

        // then reset the batch!
        this.currentBatchSize = 0;

    },

    unloadTexture: function (base) {

        for (var i = base._gl.length - 1; i >= 0; i--)
        {
            var glTexture = base._gl[i];

            if (this.gl && glTexture)
            {
                this.gl.deleteTexture(glTexture);
            }
        }

        base._gl.length = 0;

        base.dirty();

    },

    loadTexture: function (base) {

        var gl = this.gl;

        if (!base._gl[gl.id])
        {
            base._gl[gl.id] = gl.createTexture();
        }

        gl.bindTexture(gl.TEXTURE_2D, base._gl[gl.id]);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, base.premultipliedAlpha);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, base.source);

        if (base.scaleMode)
        {
            //  scaleMode 1 = Nearest
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        }
        else
        {
            //  scaleMode 0 = Linear
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        }

        if (base._pot)
        {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        }
        else
        {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }

        base._dirty[gl.id] = false;

    },

    handleContextLost: function (event) {

        event.preventDefault();
        this.contextLost = true;

    },

    handleContextRestored: function () {

        this.boot();

        // empty all the ol gl textures as they are useless now
        // for(var key in PIXI.TextureCache)
        // {
        //     var texture = PIXI.TextureCache[key].baseTexture;
        //     texture._gl = [];
        // }

        this.contextLost = false;

    },

};
PhaserMicro.Canvas = function (game) {

    this.game = game;
    this.canvas = game.canvas;

};

PhaserMicro.Canvas.prototype = {

    boot: function () {

        this.context = this.canvas.getContext("2d", { alpha: false });

    },

    render: function () {

        this.context.clearRect(0, 0, this.width, this.height);

        this.renderDisplayObject(this.root, this.projection);

    }

};

/**
* @author       Richard Davey @photonstorm
* @copyright    2015 Photon Storm Ltd.
* @license      {@link https://github.com/photonstorm/phaser/blob/master/license.txt|MIT License}
*/

PhaserMicro.Loader = function (game) {

    this.game = game;
    this.cache = game.cache;

    this.baseURL = '';
    this.path = '';

    this.isLoading = false;
    this.hasLoaded = false;

    this._fileList = [];
    this._flightQueue = [];
    this._fileLoadStarted = false;
    this._totalFileCount = 0;

};

PhaserMicro.Loader.prototype = {

    reset: function () {

        this.isLoading = false;
        this.hasLoaded = false;

        this._fileList.length = 0;
        this._flightQueue.length = 0;
        this._fileLoadStarted = false;
        this._totalFileCount = 0;
        this._processingHead = 0;

    },

    addToFileList: function (type, key, url, properties, extension) {

        if (key === undefined || key === '')
        {
            console.warn("Phaser.Loader: Invalid or no key given of type " + type);
            return this;
        }

        if (url === undefined || url === null)
        {
            if (extension)
            {
                url = key + extension;
            }
            else
            {
                console.warn("Phaser.Loader: No URL given for file type: " + type + " key: " + key);
                return this;
            }
        }

        var file = {
            type: type,
            key: key,
            path: this.path,
            url: url,
            data: null,
            loading: false,
            loaded: false,
            error: false
        };

        if (properties)
        {
            for (var prop in properties)
            {
                file[prop] = properties[prop];
            }
        }

        this._fileList.push(file);
        this._totalFileCount++;

        return this;

    },

    image: function (key, url) {

        return this.addToFileList('image', key, url, undefined, '.png');

    },

    start: function () {

        if (this.isLoading)
        {
            return;
        }

        this.hasLoaded = false;
        this.isLoading = true;

        this._processingHead = 0;

        this.processLoadQueue();

    },

    processLoadQueue: function () {

        if (!this.isLoading)
        {
            console.warn('Phaser.Loader - active loading canceled / reset');
            this.finishedLoading(true);
            return;
        }

        // Empty the flight queue as applicable
        for (var i = 0; i < this._flightQueue.length; i++)
        {
            var file = this._flightQueue[i];

            if (file.loaded || file.error)
            {
                this._flightQueue.splice(i, 1);
                i--;

                file.loading = false;
                file.requestUrl = null;
                file.requestObject = null;

                if (file.error)
                {
                    PhaserMicro.log('File loading error' + file.key);
                    // this.onFileError.dispatch(file.key, file);
                }

                this._loadedFileCount++;
                PhaserMicro.log('File Complete ' + file.key);
                // this.onFileComplete.dispatch(this.progress, file.key, !file.error, this._loadedFileCount, this._totalFileCount);
            }
        }

        for (var i = this._processingHead; i < this._fileList.length; i++)
        {
            var file = this._fileList[i];

            if (file.loaded || file.error)
            {
                // Item at the start of file list finished, can skip it in future
                if (i === this._processingHead)
                {
                    this._processingHead = i + 1;
                }
            }
            else if (!file.loading && this._flightQueue.length < 4)
            {
                // -> not loaded/failed, not loading
                if (!this._fileLoadStarted)
                {
                    this._fileLoadStarted = true;
                    // this.onLoadStart.dispatch();
                }

                this._flightQueue.push(file);
                file.loading = true;
                // this.onFileStart.dispatch(this.progress, file.key, file.url);
                this.loadFile(file);
            }

            // Stop looking if queue full
            if (this._flightQueue.length >= 4)
            {
                break;
            }
        }

        // True when all items in the queue have been advanced over
        // (There should be no inflight items as they are complete - loaded/error.)
        if (this._processingHead >= this._fileList.length)
        {
            this.finishedLoading();
        }
        else if (!this._flightQueue.length)
        {
            // Flight queue is empty but file list is not done being processed.
            // This indicates a critical internal error with no known recovery.
            console.warn("Phaser.Loader - aborting: processing queue empty, loading may have stalled");

            var _this = this;

            setTimeout(function () {
                _this.finishedLoading(true);
            }, 2000);
        }

    },

    loadFile: function (file) {

        switch (file.type)
        {
            case 'image':
                this.loadImageTag(file);
                break;
        }

    },

    loadImageTag: function (file) {

        var _this = this;

        file.data = new Image();
        file.data.name = file.key;

        if (this.crossOrigin)
        {
            file.data.crossOrigin = this.crossOrigin;
        }

        file.data.onload = function () {
            if (file.data.onload)
            {
                file.data.onload = null;
                file.data.onerror = null;
                _this.fileComplete(file);
            }
        };

        // file.data.onerror = function () {
        //     if (file.data.onload)
        //     {
        //         file.data.onload = null;
        //         file.data.onerror = null;
        //         _this.fileError(file);
        //     }
        // };

        file.data.src = this.transformUrl(file.url, file);

        // Image is immediately-available/cached
        if (file.data.complete && file.data.width && file.data.height)
        {
            file.data.onload = null;
            file.data.onerror = null;
            this.fileComplete(file);
        }

    },

    transformUrl: function (url, file) {

        if (!url)
        {
            return false;
        }

        if (url.match(/^(?:blob:|data:|http:\/\/|https:\/\/|\/\/)/))
        {
            return url;
        }
        else
        {
            return this.baseURL + file.path + url;
        }

    },

    fileComplete: function (file, xhr) {

        var loadNext = true;

        switch (file.type)
        {
            case 'image':

                this.cache.addImage(file.key, file.url, file.data);
                break;
        }

        if (loadNext)
        {
            this.asyncComplete(file);
        }

    },

    asyncComplete: function (file, errorMessage) {

        if (errorMessage === undefined) { errorMessage = ''; }

        file.loaded = true;
        file.error = !!errorMessage;

        if (errorMessage)
        {
            file.errorMessage = errorMessage;

            console.warn('Phaser.Loader - ' + file.type + '[' + file.key + ']' + ': ' + errorMessage);
        }

        this.processLoadQueue();

    },

    finishedLoading: function (abnormal) {

        if (this.hasLoaded)
        {
            return;
        }

        this.hasLoaded = true;
        this.isLoading = false;

        // If there were no files make sure to trigger the event anyway, for consistency
        if (!abnormal && !this._fileLoadStarted)
        {
            this._fileLoadStarted = true;
            // this.onLoadStart.dispatch();
        }

        // this.onLoadComplete.dispatch();

        this.reset();

        PhaserMicro.log('Load Complete');

        this.game.start();

    }

};

/**
* @author       Richard Davey @photonstorm
* @copyright    2015 Photon Storm Ltd.
* @license      {@link https://github.com/photonstorm/phaser/blob/master/license.txt|MIT License}
*/

PhaserMicro.Cache = function (game) {

    this.game = game;

    this._cache = {
        image: {}
    };

};

PhaserMicro.Cache.prototype = {

    addImage: function (key, url, data) {

        var img = {
            key: key,
            url: url,
            data: data,
            base: new PhaserMicro.BaseTexture(data)
        };

        //  WebGL only
        if (this.game.pixelArt)
        {
            img.base.scaleMode = 1;
        }

        this.game.renderer.loadTexture(img.base);

        this._cache.image[key] = img;

        return img;

    },

    getTexture: function (key) {

        return this._cache.image[key].base;

    },

    getImage: function (key, full) {

        var img = this._cache.image[key];

        if (full)
        {
            return img;
        }
        else
        {
            return img.data;
        }

    }

};

/**
* @author       Richard Davey @photonstorm
* @author       Mat Groves @Doormat23
* @copyright    2015 Photon Storm Ltd.
* @license      {@link https://github.com/photonstorm/phaser/blob/master/license.txt|MIT License}
*/

PhaserMicro.Texture = function (baseTexture) {

    this.baseTexture = baseTexture;

    this.frame = { x: 0, y: 0, width: baseTexture.width, height:baseTexture.height };
    this.width = this.frame.width;
    this.height = this.frame.height;

    this.requiresUpdate = false;

    this._uvs = { x0: 0, y0: 0, x1: 0, y1: 0, x2: 0, y2: 0, x3: 0, y3: 0 };

    this.updateUVs();

};

PhaserMicro.Texture.prototype = {

    updateUVs: function () {

        //  Swap for 'this.crop' once we add atlas support back in
        var frame = this.frame;
        var tw = this.baseTexture.width;
        var th = this.baseTexture.height;
        
        this._uvs.x0 = frame.x / tw;
        this._uvs.y0 = frame.y / th;

        this._uvs.x1 = (frame.x + frame.width) / tw;
        this._uvs.y1 = frame.y / th;

        this._uvs.x2 = (frame.x + frame.width) / tw;
        this._uvs.y2 = (frame.y + frame.height) / th;

        this._uvs.x3 = frame.x / tw;
        this._uvs.y3 = (frame.y + frame.height) / th;

    }

};

PhaserMicro.BaseTexture = function (source) {

    this.width = source.width;
    this.height = source.height;
    this.source = source;

    this.scaleMode = PhaserMicro.LINEAR;
    this.premultipliedAlpha = true;

    this._gl = [];
    this._pot = false;
    this._dirty = [true, true, true, true];

};

PhaserMicro.BaseTexture.prototype = {

    dirty: function () {

        for (var i = 0; i < this._glTextures.length; i++)
        {
            this._dirty[i] = true;
        }

    }

};

/**
* @author       Richard Davey @photonstorm
* @author       Mat Groves @Doormat23
* @copyright    2015 Photon Storm Ltd.
* @license      {@link https://github.com/photonstorm/phaser/blob/master/license.txt|MIT License}
*/

PhaserMicro.Sprite = function (game, x, y, key) {

    this.game = game;

    this.position = { x: x, y: y };

    this.scale = { x: 1, y: 1 };

    this.anchor = { x: 0, y: 0 };

    this.pivot = { x: 0, y: 0 };

    this.rotation = 0;

    this.visible = true;

    this.renderable = true;

    this.parent = null;

    this.worldAlpha = 1;
    this.alpha = 1;

    this.worldTransform = new PhaserMicro.Matrix();

    this.tint = 0xffffff;

    this.blendMode = PhaserMicro.BLEND_NORMAL;

    this.texture = new PhaserMicro.Texture(game.cache.getTexture(key));

    this._width = this.texture.width;
    this._height = this.texture.height;
    this._rot = 0;
    this._sr = 0;
    this._cr = 1;

};

PhaserMicro.Sprite.prototype = {

    updateTransform: function() {

        //  Create matrix refs for easy access
        var pt = this.parent.worldTransform;
        var wt = this.worldTransform;

        var a = this.scale.x;
        var d = this.scale.y;

        var tx = this.position.x - this.pivot.x * a;
        var ty = this.position.y - this.pivot.y * d;

        //  If rotation !== 0
        if (this.rotation % PhaserMicro.PI_2)
        {
            //  Check to see if the rotation is the same as the previous render.
            //  This means we only need to use sin and cos when rotation actually changes
            if (this.rotation !== this._rot)
            {
                this._rot = this.rotation;
                this._sr = Math.sin(this.rotation);
                this._cr = Math.cos(this.rotation);
            }

            //  Get the matrix values of the sprite based on its transform properties

            // a  =  this._cr * this.scale.x;
            a *=  this._cr;
            var b  =  this._sr * this.scale.x;
            var c  = -this._sr * this.scale.y;
            // d  =  this._cr * this.scale.y;
            d  *=  this._cr;
            tx =  this.position.x;
            ty =  this.position.y;
            
            //  Check for pivot.. not often used so geared towards that fact!
            if (this.pivot.x || this.pivot.y)
            {
                tx -= this.pivot.x * a + this.pivot.y * c;
                ty -= this.pivot.x * b + this.pivot.y * d;
            }

            //  Concat the parent matrix with the objects transform
            wt.a  = a  * pt.a + b  * pt.c;
            wt.b  = a  * pt.b + b  * pt.d;
            wt.c  = c  * pt.a + d  * pt.c;
            wt.d  = c  * pt.b + d  * pt.d;
            wt.tx = tx * pt.a + ty * pt.c + pt.tx;
            wt.ty = tx * pt.b + ty * pt.d + pt.ty;
        }
        else
        {
            wt.a  = a  * pt.a;
            wt.b  = a  * pt.b;
            wt.c  = d  * pt.c;
            wt.d  = d  * pt.d;
            wt.tx = tx * pt.a + ty * pt.c + pt.tx;
            wt.ty = tx * pt.b + ty * pt.d + pt.ty;
        }

        this.worldAlpha = this.alpha * this.parent.worldAlpha;

    }

};

PhaserMicro.Sprite.prototype.constructor = PhaserMicro.Sprite;

Object.defineProperties(PhaserMicro.Sprite.prototype, {

    'width': {

        get: function() {
            return this.scale.x * this.texture.frame.width;
        },

        set: function(value) {
            this.scale.x = value / this.texture.frame.width;
            this._width = value;
        }

    },

    'height': {

        get: function() {
            return  this.scale.y * this.texture.frame.height;
        },

        set: function(value) {
            this.scale.y = value / this.texture.frame.height;
            this._height = value;
        }

    },

    'worldVisible': {

        get: function() {

            var item = this;

            do
            {
                if (!item.visible)
                {
                    return false;
                }

                item = item.parent;
            }
            while(item);

            return true;
        }

    },

    'x': {

        get: function() {
            return this.position.x;
        },

        set: function(value) {
            this.position.x = value;
        }

    },

    'y': {

        get: function() {
            return this.position.y;
        },

        set: function(value) {
            this.position.y = value;
        }

    }

});

/**
* @author       Richard Davey @photonstorm
* @author       Mat Groves @Doormat23
* @copyright    2015 Photon Storm Ltd.
* @license      {@link https://github.com/photonstorm/phaser/blob/master/license.txt|MIT License}
*/

PhaserMicro.Matrix = function() {

    this.a = 1;
    this.b = 0;
    this.c = 0;
    this.d = 1;
    this.tx = 0;
    this.ty = 0;

};

/*
PhaserMicro.Matrix.prototype = {

    fromArray: function (array) {

        this.a = array[0];
        this.b = array[1];
        this.c = array[3];
        this.d = array[4];
        this.tx = array[2];
        this.ty = array[5];

    },

    toArray: function (transpose) {

        if(!this.array) this.array = new Float32Array(9);

        var array = this.array;

        if(transpose)
        {
            array[0] = this.a;
            array[1] = this.b;
            array[2] = 0;
            array[3] = this.c;
            array[4] = this.d;
            array[5] = 0;
            array[6] = this.tx;
            array[7] = this.ty;
            array[8] = 1;
        }
        else
        {
            array[0] = this.a;
            array[1] = this.c;
            array[2] = this.tx;
            array[3] = this.b;
            array[4] = this.d;
            array[5] = this.ty;
            array[6] = 0;
            array[7] = 0;
            array[8] = 1;
        }

        return array;

    },

    apply: function(pos, newPos) {

        newPos = newPos || { x: 0, y: 0 };

        newPos.x = this.a * pos.x + this.c * pos.y + this.tx;
        newPos.y = this.b * pos.x + this.d * pos.y + this.ty;

        return newPos;

    },

    applyInverse: function (pos, newPos) {

        newPos = newPos || new { x: 0, y: 0 };

        var id = 1 / (this.a * this.d + this.c * -this.b);
         
        newPos.x = this.d * id * pos.x + -this.c * id * pos.y + (this.ty * this.c - this.tx * this.d) * id;
        newPos.y = this.a * id * pos.y + -this.b * id * pos.x + (-this.ty * this.a + this.tx * this.b) * id;

        return newPos;

    },

    translate: function (x , y) {

        this.tx += x;
        this.ty += y;
        
        return this;

    },

    scale: function (x, y) {

        this.a *= x;
        this.d *= y;
        this.c *= x;
        this.b *= y;
        this.tx *= x;
        this.ty *= y;

        return this;

    },

    rotate: function (angle) {

        var cos = Math.cos(angle);
        var sin = Math.sin(angle);

        var a1 = this.a;
        var c1 = this.c;
        var tx1 = this.tx;

        this.a = a1 * cos - this.b * sin;
        this.b = a1 * sin + this.b * cos;
        this.c = c1 * cos - this.d * sin;
        this.d = c1 * sin + this.d * cos;
        this.tx = tx1 * cos - this.ty * sin;
        this.ty = tx1 * sin + this.ty * cos;
     
        return this;

    },

    append: function (matrix) {

        var a1 = this.a;
        var b1 = this.b;
        var c1 = this.c;
        var d1 = this.d;

        this.a  = matrix.a * a1 + matrix.b * c1;
        this.b  = matrix.a * b1 + matrix.b * d1;
        this.c  = matrix.c * a1 + matrix.d * c1;
        this.d  = matrix.c * b1 + matrix.d * d1;

        this.tx = matrix.tx * a1 + matrix.ty * c1 + this.tx;
        this.ty = matrix.tx * b1 + matrix.ty * d1 + this.ty;
        
        return this;

    },

    identity: function () {

        this.a = 1;
        this.b = 0;
        this.c = 0;
        this.d = 1;
        this.tx = 0;
        this.ty = 0;

        return this;

    }

};

PhaserMicro.identityMatrix = new PhaserMicro.Matrix();

*/


    if (typeof exports !== 'undefined') {
        if (typeof module !== 'undefined' && module.exports) {
            exports = module.exports = PhaserMicro;
        }
        exports.PhaserMicro = PhaserMicro;
    } else if (typeof define !== 'undefined' && define.amd) {
        define('PhaserMicro', (function() { return root.PhaserMicro = PhaserMicro; })() );
    } else {
        root.PhaserMicro = PhaserMicro;
    }

    return PhaserMicro;
}).call(this);