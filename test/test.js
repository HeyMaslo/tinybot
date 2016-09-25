var expect  = require('expect');
var slub    = require('./slub');
var secrets = require('./secrets');
var Tinybot = require('../index');
var debug   = require('debug')('tinybot:test');

var slackToken = secrets.token;

if( !slackToken ) { return console.error("Put your slack token into secrets.json in this folder") }

describe('live calls', function() {
  it('connects to slack as expected', function(cb) {
    var bot = new Tinybot(slackToken);
    bot.start(cb);
  })

  it('can send a message', function(cb) {
    var bot = new Tinybot(slackToken);

    bot.start(function(err) {
      if( err ) { return cb(err); }

      bot.on('message', function listener(message, channel) {
        if( !message.reply_to ) { return; }
        expect(message.ts).toExist(JSON.stringify(message) + ' is not ok.');
        bot.removeListener('message', listener);
        cb();
      })

      bot.say('Mocha live test', '#marvinandme');
    })
  })
})

describe('tinybot', function() {
  var bot;
  before(function(cb){
    slub.serve(6969, function(err) {
      if( err ) { return cb(err); }
      bot = new Tinybot(slackToken, null, 'http://localhost:6969');
      bot.start(cb);
    });
  })

  afterEach(function() {
    bot.drop('*');
  })

  describe('hearing', function() {
    it('matches exact', function(cb) {
      bot.hears({text: 'cool'}, function(message) {
        expect(message.type).toEqual('message', `Unexpected message: ${JSON.stringify(message)}`);
        cb();
      });
      slub.socket.send({ text: 'cool' })
    })

    it('matches a regexp', function(cb) {
      bot.hears({filename: /n(.*)e/}, function(message, matches) {
        expect(matches[1]).toEqual('op');
        cb();
      })
      slub.socket.send({ file: { name: 'foo nope bar'}});
    })

    it('translates usernames', function(cb) {
      bot.hears({user: 'neil'}, function(message) {
        cb();
      })
      slub.socket.send({ user: 'n0'}); // this is defined in slub as the ID for neil
    })

    it('allows hearing once', function(cb) {
      var counter = 0;
      var spy = expect.createSpy();

      bot.hearsOnce({text: 'great'}, spy);

      bot.hears({text: 'great'}, function() {
        if( ++counter == 2 ) {
          expect(spy.calls.length).toEqual(1);
          cb();
        }
      })

      slub.socket.send({ text: 'red herring'});
      slub.socket.send({ text: 'great' });
      slub.socket.send({ text: 'great' });
    })

    it('matches multiple filters', function(cb) {
      var counter = 0;
      var spy = expect.createSpy();

      bot.hears({text: 'sick', channel: '#general'}, spy);
      bot.hears({text: 'sick'}, function() {
        if( ++counter == 2 ) {
          expect(spy.calls.length).toEqual(1);
          cb();
        }
      })

      slub.socket.send({ text: 'nope', channel: 'CG0'})
      slub.socket.send({ text: 'sick', channel: 'CG0'})
      slub.socket.send({ text: 'sick', channel: 'NOPE'})
    })

    describe('drop', function() {
      it('allows dropping by function name', function(cb) {
        // we can't use spies here bc we need the function name
        var counter = 0, coolCounter = 0;
        bot.hears({text: 'nice'}, function cool(message) {
          coolCounter++;
        })

        bot.hears({text: 'nice'}, function (message) {
          if( ++counter == 2 ) {
            expect(coolCounter).toEqual(1);
            cb();
          }
        })

        slub.socket.send({text: 'nice'});
        // TODO: desired api
        // waitFor(function() { return true}, function done())
        setTimeout(function wait() {
          if( counter < 1 ) { return setTimeout(wait, 10); }
          bot.drop('cool');
          slub.socket.send({text: 'nice'});
        }, 10);
      })

      it('allows dropping multiple functions by wildcard', function(cb) {
        var counter = 0, coolCounter = 0;
        bot.hears({text: 'nice'}, function cool(message) {
          coolCounter++;
        })

        bot.hears({text: 'nice'}, function cool_grand(message) {
          coolCounter++;
        })

        bot.hears({text: 'nice'}, function (message) {
          if( ++counter == 2 ) {
            expect(coolCounter).toEqual(2);
            cb();
          }
        })

        slub.socket.send({text: 'nice'});
        setTimeout(function wait() {
          if( counter < 1 ) { return setTimeout(wait, 10); }
          bot.drop('cool*');
          slub.socket.send({text: 'nice'});
        }, 10);
      })
    })
  })
})

function expectConversation(conversation, cb) {
  async.series(conversation.map(function(message) {
    return function(cb) {
      if( !!message.response ) {
        return slub.socket.shouldReceive(message.response, cb);
      }

      slub.socket.send(message);
      cb();
    }
  }), cb);
}