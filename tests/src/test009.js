var game = new PhaserNano.Game(800, 600, 'canvas', '', { preload: preload, create: create, update: update, render: render });

function preload () {

    game.load.image('sky', 'assets/deepblue.png');
    game.load.image('snowflake', 'assets/snowflake.png');

}

var pool = [];

function create() {

    game.add.sprite(0, 0, 'sky');

    var sprite;

    for (var i = 0; i < 300; i++)
    {
        var x = Math.random() * game.width;
        var y = Math.random() * game.height;
        sprite = game.add.sprite(x, y, 'snowflake');
        sprite.blendMode = 1;
        sprite.anchor.x = 0.5;
        sprite.anchor.y = 0.5;
        var scale = 0.1 + Math.random();
        sprite.scale.x = scale;
        sprite.scale.y = scale;
        pool.push( { s: sprite, tx: Math.random() * 4, ty: 2 + Math.random() * 6 });
    }

}

function update() {

    var s;

    for (var i = 0; i < pool.length; i++)
    {
        s = pool[i].s;

        s.rotation += 0.01;

        s.x += pool[i].tx;
        s.y += pool[i].ty;

        if (s.x > 860)
        {
            s.x = -100;
        }

        if (s.y > 864)
        {
            s.y = -124;
        }
    }

}

function render() {

}
