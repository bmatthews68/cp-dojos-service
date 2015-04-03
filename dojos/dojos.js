'use strict';

var _ = require('lodash');
var path = require('path');
var async = require('async');
var ObjectID = require('mongodb').ObjectID;

module.exports = function (options) {
  var seneca = this;
  var plugin = 'cd-dojos';
  var ENTITY_NS = 'cd/dojos';


  seneca.add({role: plugin, cmd: 'search'}, cmd_search);
  seneca.add({role: plugin, cmd: 'list'}, cmd_list);
  seneca.add({role: plugin, cmd: 'create'}, cmd_create);
  seneca.add({role: plugin, cmd: 'update'}, cmd_update);
  seneca.add({role: plugin, cmd: 'delete'}, cmd_delete);
  seneca.add({role: plugin, cmd: 'my_dojos_count'}, cmd_my_dojos_count);
  seneca.add({role: plugin, cmd: 'my_dojos_search'}, cmd_my_dojos_search);


  function cmd_search(args, done){
    var seneca = this, query = {}, dojos_ent;
    query = args.query;
    dojos_ent = seneca.make$(ENTITY_NS);
    dojos_ent.list$(query, done);
  }

  function cmd_list(args, done) {
    var seneca = this;
    seneca.make(ENTITY_NS).list$(function(err, response) {
      if(err) return done(err);
      var dojosByCountry = {};
      response = _.sortBy(response, 'country_name');
      async.each(response, function(dojo, dojoCb) {
        if(dojo.deleted === 1 || dojo.verified === 0 || dojo.stage !== 2) return dojoCb();
        var id = dojo.id;
        if(!dojosByCountry[dojo.country_name]) {
          dojosByCountry[dojo.country_name] = {};
          dojosByCountry[dojo.country_name].dojos = [];
          dojosByCountry[dojo.country_name].dojos.push(dojo);
        } else {
          dojosByCountry[dojo.country_name].dojos.push(dojo);
        }
        dojoCb();
      }, function() {
        var countries = Object.keys(dojosByCountry);
        async.eachSeries(countries, function(countryName, cb) {
          dojosByCountry[countryName].dojos = _.sortBy(dojosByCountry[countryName].dojos, 'name');
          cb();
        }, function() {
          done(null, dojosByCountry);
        });
      });
    });
  }

  function cmd_create(args, done){
    var seneca = this, dojo = args.dojo;
    var userEntity = seneca.make$('sys/user');
    var createdby = args.user;
    dojo.creator = createdby;

    seneca.make$(ENTITY_NS).save$(dojo, function(err, dojo) {
      if(err) return done(err);
      userEntity.load$(createdby, function(err, user) {
        if(err) return done(err);
        if(!user.dojos) user.dojos = [];
        user.dojos.push(dojo.id);
        userEntity.save$(user, function(err, response) {
          if(err) return done(err);
          done(null, dojo);
        });
      });
    });
  }

  function cmd_update(args, done){
    var seneca = this;
    var dojo = args.dojo;
    seneca.make(ENTITY_NS).save$(dojo, function(err, response) {
      if(err) return done(err);
      done(null, response);
    });
  }

  function cmd_delete(args, done){
    var seneca = this;
    var dojoEntity = seneca.make$(ENTITY_NS);
    var userEntity = seneca.make$('sys/user');
    
    dojoEntity.load$(args.id, function(err, dojo) {
      if(err) return done(err);
      var createdby = dojo.creator;
      dojoEntity.remove$(args.id, function(err, dojoRemoved) {
        if(err) return done(err);

        userEntity.load$(createdby, function(err, user) {
          if(err) return done(err);
          var dojoToRemove;
          _.find(user.dojos, function(dojo, index) {
            if(dojo === args.id) {
              dojoToRemove = index;
            }
          });
          user.dojos.splice(dojoToRemove, 1);
          userEntity.save$(user, function(err, response) {
            if(err) return done(err);
            done(null, dojoRemoved);
          });
        });
      });
    });
  }

  function cmd_my_dojos_count(args, done) {
    var seneca = this, query = {};
    var user = args.user;
    query._id = {$in:user.dojos||[]};
    seneca.make$(ENTITY_NS).list$(query, function(err, response) {
      if(err) return done(err);
      done(null, response.length);
    });
  }

  function cmd_my_dojos_search(args, done){
    var seneca = this, query = {};
    var user = args.user;
    query = args.query

    if(query.skip !== undefined){
      query.skip$ = query.skip;
      delete query.skip;
    }

    if(query.limit !== undefined){
      query.limit$ = query.limit;
      delete query.limit;
    }

    if(query.sort !== undefined){
      query.sort$ = query.sort;
      delete query.sort;
    }

    query._id = {
      $in: _.map(user.dojos, function(dojoid) { return new ObjectID(dojoid); })
    };

    seneca.make$(ENTITY_NS).list$(query, function(err, response) {
      if(err) return done(err);
      done(null, response);
    });
  }

  return {
    name: plugin
  };

};