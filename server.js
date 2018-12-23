//Proto Path
var PROTO_PATH = __dirname+'/proto/main.proto'
const grpc = require('grpc')
const proto = grpc.load(PROTO_PATH).proto.main

// const protoLoader = require('@grpc/proto-loader');
// const packageDefinition = protoLoader.loadSync(PROTO_PATH);
// console.log('ya ' + JSON.stringify(packageDefinition));
//instantiate server
var server = new grpc.Server();

//node libraries' variables
var captchapng = require('captchapng')
var mysql = require('mysql')

//datetime
var moment = require('moment')

//filesystem
var fs = require('fs')
//file upload
var gm = require('gm')
//push message
var apn = require('apn');
//json web token library
let jwt = require("jsonwebtoken");
let secretObj = require(__dirname+'/crawling_js/secret')
var authCheck = 'select user_id from user where user_id = ?'

//Production Mode
var options = {
  gateway: 'gateway.push.apple.com',
  cert:__dirname+'/Distribution_cert/Distribution_APNS/apns_production_cert.pem',
  key:__dirname+'/Distribution_cert/Distribution_APNS/apns_production_key.unencrypted.pem',
  production: false//if this is false, it works. But, it doesn't work when true
}

let apnProvider = new apn.Provider(options)


// var conn = mysql.createConnection({
//   host     : 'localhost',
//   user     : 'root',
//   password : 'Dhtp123rbs.',
//   connectTimeout:0,
//   database : 'sekyunoh'
// })
//
// conn.connect(
//   function(err){
//   if(err){
//     console.error('error connecting'+err.stack);
//     return;
//   }
//   conn.end();
// });

// var config = {
//  host:'localhost',
//  user:'root',
//  password:'Dhtp123rbs.',
//  database:'sekyunoh'
// }

//var conn;
//Reconnect to db when db is disconnected by default timeout of it
// function handleDisconnect() {
//   conn = mysql.createConnection(config); // Recreate the connection, since
//                                                   // the old one cannot be reused.
//
//   conn.connect(function(err) {              // The server is either down
//     if(err) {                                     // or restarting (takes a while sometimes).
//       console.log('error when connecting to db:', err);
//       setTimeout(handleDisconnect, 2000); // We introduce a delay before attempting to reconnect,
//     }                                     // to avoid a hot loop, and to allow our node script to
//   });                                     // process asynchronous requests in the meantime.
//                                           // If you're also serving http, display a 503 error.
//   conn.on('error', function(err) {
//     console.log('db error', err);
//     if(err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
//       conn.release();
//       conn.end();
//       handleDisconnect();                         // lost due to either server restart, or a
//     } else {                                      // connnection idle timeout (the wait_timeout
//       throw err;                                  // server variable configures this)
//     }
//   });
// }
//
// handleDisconnect();

var conn = mysql.createPool({
  host:'localhost',
  user:'root',
  password:'Dhtp123rbs.',
  database:'sekyunoh'
})
//conn.query() internally acquire connection and release when query is executed


var express = require('express')
var app = express()
//downloading image from request for kingfisher
app.get('/download/:type/:id', function (req, res, next) {
  //console.log('The id: ' + req.params.id + ' Type: ' + req.params.type);
    if(req.params.type == 'images'){//normal images
      fs.readFile(__dirname + '/images/'+req.params.id,function(err,data){
        res.writeHead(200,{'Content-Type': 'image/gif' })
        res.end(data,'binary')
      })
    }else{//universities
      fs.readFile(__dirname + '/university_images/'+req.params.id+'.jpeg',function(err,data){
        res.writeHead(200,{'Content-Type': 'image/gif' })
        res.end(data,'binary')
      })
    }
}).listen(9001,function(){
  console.log('Image Download Server Start');
});

//prevent MaxListeners warning
//unlimited
process.setMaxListeners(0);

process.on('warning', e => console.warn(e.stack));
//error가 발생해도 서버가 죽지않게하기
process.on('uncaughtException', function (err) {
  console.log('Caught exception: ' + err.stack);
  //more error info
  //console.log('Caught exception: ' + err.stack);
});
//GRPC methods(before user is authorized)
//Main
function getCaptcha(call, callback){

  var img;
  var string;
  var randomNum = parseInt(Math.random()*900000+100000)
  var p = new captchapng(75,25,randomNum); // width,height,numeric captcha
  p.color(255, 255, 255, 255)  // First color: background (red, green, blue, alpha)
  p.color(0, 0, 0, 255)
  var getBase64 = p.getBase64();
  img = new Buffer(getBase64,'base64');
  string = randomNum.toString()
  //callback({ code: grpc.status.OK, details: 'OK'});
  callback(null,{key: string, captcha:img});
}

function userRegistration(call, callback){
  console.log('userRegistration => ' + JSON.stringify(call.request));
  var user = call.request
  var device = call.request.device
  var time = moment().format('YYYY-MM-DD kk:mm:ss')

  var insertUser = 'insert into user (user_nickname,user_password,user_token,mentor_nickname,mentor_profileurl,user_is_active,user_is_unregistered,user_is_logout,user_created_at,user_push,user_coin) value (?,?,?,?,?,?,?,?,?,?,?)'

  var insertDevice = 'insert into device (user_id,device_code,device_name,device_os,device_sdk_version,device_app_version,device_token) value (?,?,?,?,?,?,?)'

  var update_user_token = 'update user set user_token=? where user_id=?'

  //note: when insert query is executed duplicately, it just update values in the database

  var i;
  var bool = 'false'
  var select_user_nicknames = 'select user_nickname from user'
  conn.query(select_user_nicknames,function(err,rows){
    if(err){
      throw err
    }else{
      if(rows.length != 0){
        for(i = 0; i < rows.length; i++){
          if(rows[i].user_nickname == user.nickname){
            //duplicated
            bool = 'true'
            break
          }
        }
        if(bool == 'false'){//not duplicated
          //execute query
          conn.query(insertUser,[user.nickname,user.password,'','','',1,0,0,time,1,10],function(err,rows){
            if(err){
              throw err
              //put the user_id into userList
              //in order to communicate
              //userList.push(rows.insertId);
            }else{
              conn.query(insertDevice,[rows.insertId,device.device_code,device.device_name,device.os,device.sdk_version,device.app_version,device.device_token], function(err1, rows1){
                if(err1){
                  throw err1
                }else{
                  let payLoad = {
                    // 토큰의 내용(payload)
                    user_id:rows.insertId,
                    nickname:user.nickname,
                    password:user.password
                  }
                  let token = jwt.sign(payLoad, secretObj.secret);
                  conn.query(update_user_token,[token,rows.insertId],function(err2,rows2){
                    if(err2){
                      throw err2
                    }else{
                      callback(null,{user_id:rows.insertId,token:token,is_nickname_duplicated:'false'})
                    }
                  })
                }
              })
            }
          })
        }else{//duplicated
          callback(null,{user_id:0,token:'',is_nickname_duplicated:'true'})
        }
      }else{
        //no user exists
        //will be first user
        //execute query
        conn.query(insertUser,[user.nickname,user.password,'','','',1,0,0,time,1,10],function(err,rows){
          if(err){
            throw err
          }else{
            conn.query(insertDevice,[rows.insertId,device.device_code,device.device_name,device.os,device.sdk_version,device.app_version,device.device_token], function(err1, rows1){
              if(err1){
                throw err1
              }else{
                let payLoad = {
                  // 토큰의 내용(payload)
                  user_id:rows.insertId,
                  nickname:user.nickname,
                  password:user.password
                }
                let token = jwt.sign(payLoad, secretObj.secret);
                conn.query(update_user_token,[token,rows.insertId],function(err2,rows2){
                  if(err2){
                    throw err2
                  }else{
                    callback(null,{user_id:rows.insertId,token:token,is_nickname_duplicated:'false'})
                  }
                })
              }
            })
          }
        })
      }
    }
  })
}

//AuthorizedMain
//after user is authorized
//user.proto
//check whether user is registered or not
function auth(call, callback){
  var updateActive = 'update user set user_is_active=?,is_app_terminated=? where user_id = ?'
    //비동기처리
    //decode token from the server and check if it is a registered user
  jwt.verify(call.request.token,secretObj.secret,function(token_err,decoded){
    if(token_err){
      throw token_err
    }else{
      console.log('decoded => ' + JSON.stringify(decoded));
      conn.query(authCheck,[decoded['user_id']],function(err,rows){
        if(err){
          throw err
        }else{
          if(rows.length == 0){//user not registerd
            callback(null,{user_id:0,is_exist:'false'})
          }else{//user already registered
            callback(null,{user_id:rows[0].user_id,is_exist:'true'})
            //update user_is_active true
            conn.query(updateActive,[1,0,rows[0].user_id],function(err,rows){
              if(err){
                throw err
              }else{

              }
            })
          }
        }
      })
    }
  });
}

function userLoginCheck(call,callback){
  console.log('user_login_check: ' + JSON.stringify(call.request));
  var select_user = 'select user_nickname,user_password from user where user_id = ?'

  conn.query(select_user,[call.request.user_id],function(err,rows){
    if(err){
      throw err
    }else{
      if(rows.length != 0){
        if((rows[0].user_nickname == call.request.nickname) && (rows[0].user_password == call.request.password)){
          console.log('true');
          callback(null,{is_info_correct:'true'})
        }else{
          console.log('false');
          callback(null,{is_info_correct:'false'})
        }
      }else{
        callback(null,{is_info_correct:'not_exist'})
      }
    }
  })
}

//update user profile
function updateProfile(call, callback){
  var updateUser = 'update user set user_nickname=?,user_token=? where user_id=?'
  var selectUser = 'select * from user'
  var bool = 'false'
  conn.query(selectUser,function(err,rows){
    if(err){
      throw err
    }else{
      for(i = 0; i < rows.length; i++){
        if(rows[i].user_nickname == call.request.nickname && rows[i].user_id != call.request.user_id){
          //duplicated
          bool = 'true'
          break
        }
      }
      if(bool == 'false'){
        //not duplicated
        let payLoad = {
          // 토큰의 내용(payload)
          user_id:call.request.user_id,
          nickname:call.request.nickname,
          password:call.request.password
        }
        let token = jwt.sign(payLoad, secretObj.secret);
        conn.query(updateUser,[call.request.nickname,token,call.request.user_id],function(err,rows){
          if(err){
            throw err
          }else{
            if(rows.affectedRows != 0){
              callback(null,{is_update_succeed:'true',token:token,is_nickname_duplicated:'false'})
            }else{
              //no rows affected
              callback(null,{is_update_succeed:'false',token:null,is_nickname_duplicated:'false'})
            }
          }
        })
      }else{
        //duplicated
        callback(null,{is_update_succeed:'false',token:null,is_nickname_duplicated:'true'})
      }
    }
  })
}

//report
function report(call, callback){
  var insertReport = 'insert into report (user_id,report_content,report_created) value (?,?,?)'
  var time = moment().format('YYYY-MM-DD kk:mm:ss')
  conn.query(insertReport,[call.request.user_id,call.request.content,time],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null)
    }
  })
}

//logout
function logout(call, callback){
  var logoutUser = 'update user set user_is_logout=? where user_id = ?'
  conn.query(logoutUser,[1,call.request.user_id],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null)
    }
  })
}

function updateActive(call,callback){
  var updateActive = 'update user set user_is_active=? where user_id = ?'
  conn.query(updateActive,[call.request.active_value,call.request.user_id],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null)
    }
  })
}

//pushUpdate
function pushUpdate(call, callback){
  var pushUpdate = 'update user set user_push=? where user_id = ?'
  conn.query(pushUpdate,[call.request.value,call.request.user_id],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null)
    }
  })
}

//unregister
function unregister(call, callback){
  var unregisterUser = 'delete from user where user_id = ?'
  conn.query(unregisterUser,[call.request.user_id],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null)
    }
  })
}

function updateAppleToken(call,callback){
  //console.log('updateAppleToken=>'+JSON.stringify(call.request));
  var updateToken = 'update device set device_token = ? where user_id = ?'
  conn.query(updateToken,[call.request.token,call.request.user_id],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null)
    }
  })
}

function appAboutTerminating(call,callback){
  var update = 'update user set is_app_terminated = ? where user_id = ?'
  conn.query(update,[1,call.request.user_id],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null)
    }
  })
}

function getOfflineMessages(call,callback){
  var get_offline_messages = 'select * from offline_message where receiver_id = ?'
  var delete_offline_messages = 'delete from offline_message where receiver_id = ?'

  conn.query(get_offline_messages,[call.request.user_id],function(err,rows){
    if(err){
      throw err
    }else{
      conn.query(delete_offline_messages,[call.request.user_id],function(err1,rows1){
        if(err1){
          throw err1
        }else{
          //console.log('yay=>' + JSON.stringify(rows));
          callback(null,{messages:rows})
        }
      })
    }
  })
}

//mentor.proto
function mentorRegister(call, callback){

  var registerMentor = 'insert into mentor (user_id,mentor_nickname,mentor_university,mentor_major,mentor_backgroundurl,mentor_profileurl,mentor_mentoring_area,mentor_mentoring_field,mentor_introduction,mentor_information,mentor_touch_count,mentor_favorite_count,mentor_is_active,mentor_created_at) value (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  //this is for convenience to get conversation data
  var update_user_mentor_nickname_and_profileurl = 'update user set mentor_nickname=?,mentor_profileurl=? where user_id=?'
  var call = call.request
  var time = moment().format('YYYY-MM-DD kk:mm:ss')

  conn.query(registerMentor,[call.user_id,call.mentor_nickname,call.mentor_university,call.mentor_major,call.mentor_backgroundurl,call.mentor_profileurl,call.mentor_mentoring_area,call.mentor_mentoring_field,call.mentor_introduction,call.mentor_information,1,0,1,time],function(err,rows){
    if(err){
      throw err
    }else{
      conn.query(update_user_mentor_nickname_and_profileurl,[call.mentor_nickname,call.mentor_profileurl,call.user_id],function(err1,rows1){
        if(err1){
          throw err1
        }else{
          callback(null,{mentor_id:rows.insertId})
          saveImages(call.mentor_backgroundurl,call.background_image)
          saveImages(call.mentor_profileurl,call.profile_image)
        }
      })
    }
  })
}

//updateMentorInfo
function updateMentorInfo(call,callback){
  var updateMentor = 'update mentor set mentor_nickname=?,mentor_university=?,mentor_major=?,mentor_backgroundurl=?,mentor_profileurl=?,mentor_mentoring_area=?,mentor_mentoring_field=?,mentor_introduction=?,mentor_information=? where mentor_id=?'

  var update_user_mentor_nickname_and_profileurl = 'update user set mentor_nickname=?,mentor_profileurl=? where user_id=?'
  var call = call.request

  conn.query(updateMentor,[call.mentor_nickname,call.mentor_university,call.mentor_major,call.mentor_backgroundurl,call.mentor_profileurl,call.mentor_mentoring_area,call.mentor_mentoring_field,call.mentor_introduction,call.mentor_information,call.mentor_id],function(err,rows){
    if(err){
      throw err
    }else{
      conn.query(update_user_mentor_nickname_and_profileurl,[call.mentor_nickname,call.mentor_profileurl,call.user_id],function(err1,rows1){
        if(err1){
          throw err1
        }else{
          callback(null)
          saveImages(call.mentor_backgroundurl,call.background_image)
          saveImages(call.mentor_profileurl,call.profile_image)
        }
      })
    }
  })
}

function saveImages(url,data){
  if(fs.existsSync(__dirname+"/images/"+url)){
    console.log('The requested image already exists!');
  }else{
    console.log('The requested image does not exists!');
    gm(data)
    //.resize(700, 700,'!')
    .noProfile()
    .noise('laplacian')
    .write(__dirname+"/images/"+url, function (err) {
      if (err){
        throw err
      }
      console.log('Created an image from a Buffer!');
    })
  }
}

//getMentors
function getMentors(call,callback){

  var initBestMentor = 'select dummy.* from (select @s:=@s+1 as number_id,m.* from mentor as m ,(SELECT @s:= 0) as s ORDER BY m.mentor_favorite_count DESC) as dummy limit 0,50'

  var scroll_up_more_best_mentor = 'select dummy.* from (select @s:=@s+1 as number_id,m.* from mentor as m ,(SELECT @s:= 0) as s ORDER BY m.mentor_favorite_count DESC) as dummy where dummy.number_id < ? limit 0,50'

  var moreBestMentor = 'select dummy.* from (select @s:=@s+1 as number_id,m.* from mentor as m ,(SELECT @s:= 0) as s ORDER BY m.mentor_favorite_count DESC) as dummy where dummy.number_id > ? limit 0,50'

  var initLatestMentor = 'select dummy.* from (select @s:=@s+1 as number_id,m.* from mentor as m ,(SELECT @s:= 0) as s ORDER BY m.mentor_created_at DESC) as dummy limit 0,50'

  var scroll_up_more_latest_mentor = 'select dummy.* from (select @s:=@s+1 as number_id,m.* from mentor as m ,(SELECT @s:= 0) as s ORDER BY m.mentor_created_at DESC) as dummy where dummy.number_id < ? limit 0,50'

  var moreLatestMentor = 'select dummy.* from (select @s:=@s+1 as number_id,m.* from mentor as m ,(SELECT @s:= 0) as s ORDER BY m.mentor_created_at DESC) as dummy where dummy.number_id > ? limit 0,50'

  if(call.request.indicator == 'Best'){

    if(call.request.scroll_is == "init"){
      conn.query(initBestMentor,function(err,rows){
        if(err){
          throw err
        }else{

          callback(null,{mentors:rows})
        }
      })
    }else if(call.request.scroll_is == "up"){//user refreshs table
      if(call.request.number_id == 0){//when mentors.count == 0
        conn.query('select dummy.* from (select @s:=@s+1 as number_id,m.* from mentor as m ,(SELECT @s:= 0) as s ORDER BY m.mentor_favorite_count DESC) as dummy limit 0,10',function(err,rows){
          if(err){
            throw err
          }else{
            callback(null,{mentors:rows})
          }
        })
      }else{
        conn.query(scroll_up_more_best_mentor,[call.request.number_id],function(err,rows){
          if(err){
            throw err
          }else{

            callback(null,{mentors:rows})
          }
        })
      }
    }else{
      //user scrolls down
      conn.query(moreBestMentor,[call.request.number_id],function(err,rows){
        if(err){
          throw err
        }else{
          callback(null,{mentors:rows})
        }
      })
    }
  }else if(call.request.indicator == 'Latest'){
    if(call.request.scroll_is == "init"){
      conn.query(initLatestMentor,function(err,rows){
        if(err){
          throw err
        }else{
          callback(null,{mentors:rows})
        }
      })
    }else if(call.request.scroll_is == "up"){
      if(call.request.number_id == 0){
        conn.query('select dummy.* from (select @s:=@s+1 as number_id,m.* from mentor as m ,(SELECT @s:= 0) as s ORDER BY m.mentor_created_at DESC) as dummy limit 0,10',function(err,rows){
          if(err){
            throw err
          }else{
            callback(null,{mentors:rows})
          }
        })
      }else{
        conn.query(scroll_up_more_latest_mentor,[call.request.number_id],function(err,rows){
          if(err){
            throw err
          }else{
            callback(null,{mentors:rows})
          }
        })
      }
    }else{
      conn.query(moreLatestMentor,[call.request.number_id],function(err,rows){
        if(err){
          throw err
        }else{
          callback(null,{mentors:rows})
        }
      })
    }
  }else{//search mentors of the unversity
    var selectMentors = 'select dummy.* from (select @s:=@s+1 as number_id,m.* from mentor as m ,(SELECT @s:= 0) as s) as dummy where dummy.mentor_university = ?'
    conn.query(selectMentors,[call.request.indicator],function(err,rows){
      if(err){
        throw err
      }else{
        callback(null,{mentors:rows})
      }
    })
  }
}

//mentorTouch
function mentorTouch(call,callback){
  var updateMentorTouchCount = 'update mentor set mentor_touch_count = mentor_touch_count+1 where mentor_id=?'
  var updateMentorFavoriteCount = 'update mentor set mentor_favorite_count = mentor_favorite_count+1 where mentor_id=?'

  if (call.request.indicator == 'touch'){
    conn.query(updateMentorTouchCount,[call.request.mentor_id],function(err,rows){
      if(err){
        throw err
      }else{
        callback(null)
      }
    })
  }else{//favorite
    conn.query(updateMentorFavoriteCount,[call.request.mentor_id],function(err,rows){
      if(err){
        throw err
      }else{
        callback(null)
      }
    })
  }
}

//deleteMentor
function deleteMentor(call,callback){

  var deleteMentor = 'delete from mentor where mentor_id = ?'

  conn.query(deleteMentor,[call.request.mentor_id],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null)
    }
  })
}

//board.proto
//createBoard
function createBoard(call, callback){

  var createBoard = 'insert into board (user_id,board_type,board_university,board_major,board_title,board_content,board_touch_count,board_comment_count,board_created) values (?,?,?,?,?,?,?,?,?)'
  var call = call.request
  var time = moment().format('YYYY-MM-DD kk:mm:ss')
  conn.query(createBoard,[call.user_id,call.board_type,call.board_university,call.board_major,call.board_title,call.board_content,1,0,time],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null,{success:'true'})
    }
  })
}

//getBoards
function getBoards(call,callback){

  //looks fine but need to double check the stability
  //then, do same for mentorView, chatListView

  var board_type = call.request.board_type
  var board_university =  call.request.board_university
  var scroll_is = call.request.scroll_is
  var board_id = call.request.board_id

  //if call.request.board_type == "University Name"
  //get all the boards of the university
  //this is only called in UniversityDetailViewController
  if(board_university.length != 0){
    if(board_type.length != 0){//this is for the review in detail university
      if(scroll_is == "init"){

        var boardsForTheUniversityReview = 'select b.*,u.user_nickname from board as b inner join user as u on b.`user_id` = u.`user_id` where b.board_university = ? and b.board_type = ? ORDER BY b.board_id DESC'

        conn.query(boardsForTheUniversityReview,[board_university,board_type],function(err,rows){
          if(err){
            throw err
          }else{
            callback(null,{boards:rows})
          }
        })
      }else{//scroll_is == "up"

      var scroll_up_more_board_for_univ_review = 'select b.*,u.user_nickname from board as b inner join user as u on b.`user_id` = u.`user_id` where b.board_university = ? and b.board_type = ? and b.board_id > ? ORDER BY b.board_id'

        conn.query(scroll_up_more_board_for_univ_review,[board_university,board_type,board_id],function(err,rows){
          if(err){
            throw err
          }else{
            callback(null,{boards:rows})
          }
        })
      }

    }else{//this is for the Q&A in detail university
      if(scroll_is == "init"){

        var boardsForTheUniversityQandA = 'select b.*,u.user_nickname from board as b inner join user as u on b.`user_id` = u.`user_id` where b.board_university = ? and b.board_type != "Universities Review" ORDER BY b.board_id DESC'

        conn.query(boardsForTheUniversityQandA,[board_university],function(err,rows){
          if(err){
            throw err
          }else{
            callback(null,{boards:rows})
          }
        })
      }else{//scroll_is == "up"

      var scroll_up_more_board_for_univ_qanda = 'select b.*,u.user_nickname from board as b inner join user as u on b.`user_id` = u.`user_id` where b.board_university = ? and b.board_type != "Universities Review" and b.board_id > ? ORDER BY b.board_id'

        conn.query(scroll_up_more_board_for_univ_qanda,[board_university,board_id],function(err,rows){
          if(err){
            throw err
          }else{
            callback(null,{boards:rows})
          }
        })
      }
    }
  }else{//this is for QandAViewController

    if(scroll_is == "init"){
      //order should be descending(Last in First out) because the last row is the latest
      var init_board = 'select b.*,u.user_nickname from board as b inner join user as u on b.`user_id` = u.`user_id` where b.board_type = ? ORDER BY b.board_id DESC limit 0,50'

      conn.query(init_board,[board_type],function(err,rows){
        if(err){
          throw err
        }else{``
          callback(null,{boards:rows})
        }
      })
    }else if(scroll_is == "up"){//user refresh table

      var scroll_up_more_board = 'select b.*,u.user_nickname from board as b inner join user as u on b.`user_id` = u.`user_id` where b.board_type = ? and b.board_id > ? ORDER BY b.board_id'

      conn.query(scroll_up_more_board,[board_type,board_id],function(err,rows){
        if(err){
          throw err
        }else{
          callback(null,{boards:rows})
        }
      })
    }else{//user scrolls down

      var scroll_down_more_board = 'select b.*,u.user_nickname from board as b inner join user as u on b.`user_id` = u.`user_id` where b.board_type = ? and b.board_id < ? ORDER BY b.board_id DESC limit 0,50'

      conn.query(scroll_down_more_board,[board_type,board_id],function(err,rows){
        if(err){
          throw err
        }else{
          callback(null,{boards:rows})
        }
      })
    }
  }
}

function getMyBoards(call,callback){
  //order should be descending(Last in First out) because the last row is the latest
  var select_my_reviews = 'select b.*,u.user_nickname from board as b inner join user as u on b.`user_id` = u.`user_id` where b.board_type = ? and b.user_id = ? ORDER BY b.board_id DESC limit 0,50'

  var select_my_boards = 'select b.*,u.user_nickname from board as b inner join user as u on b.`user_id` = u.`user_id` where b.board_type != "Universities Review" and b.user_id = ? ORDER BY b.board_id DESC limit 0,50'

  if(call.request.board_type == 'Universities Review'){
    conn.query(select_my_reviews,[call.request.board_type,parseInt(call.request.user_id)],function(err,rows){
      if(err){
        throw err
      }else{
        callback(null,{boards:rows})
      }
    })
  }else{
    conn.query(select_my_boards,[parseInt(call.request.user_id)],function(err,rows){
      if(err){
        throw err
      }else{
        callback(null,{boards:rows})
      }
    })
  }
}

//boardTouch
function boardTouch(call,callback){
  var updateBoardTouchCount = 'update board set board_touch_count = board_touch_count+1 where board_id=?'
  conn.query(updateBoardTouchCount,[call.request.board_id],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null)
    }
  })
}

//reviseMyBoard
function reviseMyBoard(call,callback){
  //need to update time
  var updateMyBoard = 'update board set board_university = ?,board_major = ?, board_title = ?,board_content=?,board_created=? where board_id=?'
  var time = moment().format('YYYY-MM-DD kk:mm:ss')
  conn.query(updateMyBoard,[call.request.board_university,call.request.board_major,call.request.board_title,call.request.board_content,time,call.request.board_id],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null)
    }
  })
}

function reviseMyReview(call,callback) {
  var updateMyBoard = 'update board set board_university = ?,board_major = ?, board_title = ?,board_content=?,board_created=? where board_id=?'
  var time = moment().format('YYYY-MM-DD kk:mm:ss')
  conn.query(updateMyBoard,[call.request.board_university,call.request.board_major,call.request.board_title,call.request.board_content,time,call.request.board_id],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null)
    }
  })
}

//deleteMyBoard
function deleteMyBoard(call,callback){
  var deleteMyBoard = 'delete from board where board_id = ?'
  conn.query(deleteMyBoard,[call.request.board_id],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null)
    }
  })
}

//common.proto

//commentUpload
function commentUpload(call,callback){
  var insertComment = 'insert into comment (board_id,user_id,receiver_id,user_nickname,comment_content,comment_created) values (?,?,?,?,?,?)'
  //update comment count of the board
  var updateBoardCommentCount = 'update board set board_comment_count = board_comment_count+1 where board_id=?'
  var time = moment().format('YYYY-MM-DD kk:mm:ss')

  conn.query(insertComment,[call.request.board_id,call.request.user_id,call.request.receiver_id,call.request.user_nickname,call.request.comment_content,time],function(err,rows){
    if(err){
      throw err
    }else{
      conn.query(updateBoardCommentCount,[call.request.board_id],function(err1,rows1){
        if(err1){
          throw err1
        }else{
          callback(null)
          send_notification(call.request)
        }
      })
    }
  })
}

//repliedCommentUpload
function repliedCommentUpload(call,callback){
  var insertRepliedComment = 'insert into comment_reply (comment_id,board_id,user_id,receiver_id,user_nickname,comment_content,comment_created) values (?,?,?,?,?,?,?)'
  var time = moment().format('YYYY-MM-DD kk:mm:ss')
  conn.query(insertRepliedComment,[call.request.comment_id,call.request.board_id,call.request.user_id,call.request.receiver_id,call.request.user_nickname,call.request.comment_content,time],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null)
      send_notification(call.request)
    }
  })
}



//getComments
function getComments(call,callback){

  if (call.request.scroll_is == 'init'){
    var selectCommentsInit = 'select * from comment where board_id = ? ORDER BY comment_id limit 0,5'
    conn.query(selectCommentsInit,[call.request.board_id],function(err,rows){
      if(err){
        throw err
      }else{
        //console.log('getComments: ' + JSON.stringify(rows));
        callback(null,{comments:rows})
      }
    })
  }else{
    var selectCommentsMore = 'select * from comment where board_id = ? and comment_id > ? ORDER BY comment_id limit 0,5'
    conn.query(selectCommentsMore,[call.request.board_id,call.request.comment_id],function(err,rows){
      if(err){
        throw err
      }else{
        callback(null,{comments:rows})
      }
    })
  }
}

//getRepliedComments
function getRepliedComments(call,callback){

  if (call.request.scroll_is == 'init'){
    var selectRepliedCommentsInit = 'select * from comment_reply where comment_id = ? ORDER BY comment_reply_id limit 0,5'
    conn.query(selectRepliedCommentsInit,[call.request.comment_id],function(err,rows){
      if(err){
        throw err
      }else{
        callback(null,{comments:rows})
      }
    })
  }else{
    var selectRepliedCommentsMore = 'select * from comment_reply where comment_id = ? and comment_reply_id > ? ORDER BY comment_reply_id limit 0,5'

    conn.query(selectRepliedCommentsMore,[call.request.comment_id,call.request.comment_reply_id],function(err,rows){
      if(err){
        throw err
      }else{
        callback(null,{comments:rows})
      }
    })
  }
}

function getCommentsCount(call,callback){
  var select_count = 'select count(*) from comment where board_id = ?'

  conn.query(select_count,[call.request.board_id],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null,{count:rows[0]['count(*)']})
    }
  })
}

//mentor comment functions here
function mentorCommentUpload(call,callback){
  var insertMentorComment = 'insert into mentor_comment (mentor_id,user_id,receiver_id,user_nickname,profileurl,content,comment_created) values (?,?,?,?,?,?,?)'
  var time = moment().format('YYYY-MM-DD kk:mm:ss')

  conn.query(insertMentorComment,[call.request.mentor_id,call.request.user_id,call.request.receiver_id,call.request.user_nickname,call.request.profileurl,call.request.content,time],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null)
      send_notification(call.request)
    }
  })
}



function repliedMentorCommentUpload(call,callback){
  var insertRepliedMentorComment = 'insert into mentor_comment_reply (comment_id,mentor_id,user_id,receiver_id,user_nickname,profileurl,content,comment_created) values (?,?,?,?,?,?,?,?)'
  var time = moment().format('YYYY-MM-DD kk:mm:ss')

  conn.query(insertRepliedMentorComment,[call.request.comment_id,call.request.mentor_id,call.request.user_id,call.request.receiver_id,call.request.user_nickname,call.request.profileurl,call.request.content,time],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null)
      send_notification(call.request)
    }
  })
}


function getMentorComments(call,callback){
  if (call.request.scroll_is == 'init'){
    var selectMentorCommentsInit = 'select * from mentor_comment where mentor_id = ? ORDER BY comment_id limit 0,40'
    conn.query(selectMentorCommentsInit,[call.request.mentor_id],function(err,rows){
      if(err){
        throw err
      }else{
        callback(null,{comments:rows})
      }
    })
  }else{
    var selectMentorCommentsMore = 'select * from mentor_comment where mentor_id = ? and comment_id > ? ORDER BY comment_id limit 0,5'
    conn.query(selectMentorCommentsMore,[call.request.mentor_id,call.request.comment_id],function(err,rows){
      if(err){
        throw err
      }else{
        callback(null,{comments:rows})
      }
    })
  }
}

function getRepliedMentorComments(call,callback){
  if (call.request.scroll_is == 'init'){
    var selectRepliedMentorCommentsInit = 'select * from mentor_comment_reply where comment_id = ? ORDER BY replied_comment_id limit 0,5'

    conn.query(selectRepliedMentorCommentsInit,[call.request.comment_id],function(err,rows){
      if(err){
        throw err
      }else{
        callback(null,{comments:rows})
      }
    })
  }else{
    var selectRepliedMentorCommentsMore = 'select * from mentor_comment_reply where comment_id = ? and replied_comment_id > ? ORDER BY replied_comment_id limit 0,5'

    conn.query(selectRepliedMentorCommentsMore,[call.request.comment_id,call.request.replied_comment_id],function(err,rows){
      if(err){
        throw err
      }else{
        callback(null,{comments:rows})
      }
    })
  }
}

function getMentorCommentsCount(call,callback){
  var select_count = 'select count(*) from mentor_comment where mentor_id = ?'

  conn.query(select_count,[call.request.mentor_id],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null,{count:rows[0]['count(*)']})
    }
  })
}

function getSharedComments(call,callback){
  //here in select statements, receiver_id is my user_id
  var select_comments = 'select * from comment where receiver_id = ? order by comment_id asc limit 0,50'
  var select_replied_comments = 'select * from comment_reply where receiver_id = ? order by comment_reply_id asc limit 0,50'
  var select_mentor_comments = 'select * from mentor_comment where receiver_id = ? order by comment_id asc limit 0,50'
  var select_replied_mentor_comments = 'select * from mentor_comment_reply where receiver_id = ? order by replied_comment_id asc limit 0,50'

  conn.query(select_comments,[call.request.user_id],function(err,rows){
    if(err){
      throw err
    }else{
      conn.query(select_replied_comments,[call.request.user_id],function(err1,rows1){
        if(err1){
          throw err1
        }else{
          conn.query(select_mentor_comments,[call.request.user_id],function(err2,rows2){
            if(err2){
              throw err2
            }else{
              conn.query(select_replied_mentor_comments,[call.request.user_id],function(err3,rows3){
                if(err3){
                  throw err3
                }else{
                  callback(null,{comments:rows,replied_comments:rows1,mentor_comments:rows2,replied_mentor_comments:rows3})
                }
              })
            }
          })
        }
      })
    }
  })
}

function checkIfThereIsNewComments(call,callback){
  var combined_query = 'SELECT Sum( a.count ) FROM(SELECT Count( * ) AS count FROM comment where comment_created > ? and receiver_id = ? UNION ALL SELECT Count( * ) AS count FROM comment_reply where comment_created > ? and receiver_id = ? UNION ALL SELECT Count( * ) AS count FROM mentor_comment where comment_created > ? and receiver_id = ? UNION ALL SELECT Count( * ) AS count FROM mentor_comment_reply where comment_created > ? and receiver_id = ?) a'

  conn.query(combined_query,[call.request.date,call.request.user_id,call.request.date,call.request.user_id,call.request.date,call.request.user_id,call.request.date,call.request.user_id],function(err,rows){
    if(err){
      throw err
    }else{
      console.log('checkIfThereIsNewComments => ' + JSON.stringify(rows[0]["Sum( a.count )"]));
      callback(null,{count:rows[0]["Sum( a.count )"]})
    }
  })

}

//to push notification when user comment
function send_notification(object){
  var check_user_is_active = 'select u.user_nickname,u.user_is_active,u.user_is_logout,u.user_push,u.is_app_terminated,d.device_token from user as u inner join device as d on u.user_id = d.user_id where u.user_id = ?'
  //first, check if user is active
  conn.query(check_user_is_active,[object.receiver_id], function(err, rows){
    if(err){
      throw err
    }else{
      if(rows.length != 0){
        //receiver is not unregisterered
        //check if receiver is logged out
        if(rows[0].user_is_logout == 1){
          //receiver is logged out
        }else{
          //receiver is not logged out
          //check if user is active or not
          if(rows[0].user_is_active == 1){
            //receiver is active and not logged out
            //check if user has token
            if(rows[0].device_token == '' || rows[0].device_token == null){
              //do nothing, do not send apn
            }else{
              //only use APN if there is token of user
              //use APN to send the message
              var note = new apn.Notification();
              note.sound = "ping.aiff";
              note.topic = "MyUniversity.SekyunOh.Production.v.1.0.0";
              note.alert = rows[0].user_nickname + " commented something"
              note.expiry = Math.floor(Date.now() / 1000) + 3600;// Expires 1 hour from now.
              //note.contentAvailable = 1
              note.payload = {'object': object}
              //note.contentAvailable = 1;

              apnProvider.send(note, rows[0].device_token).then( (response) => {
                response.sent.forEach( (token) => {
                  console.log('response.sent: ' + JSON.stringify(response.sent));
                });
                response.failed.forEach( (failure) => {
                  if (failure.error) {
                    // A transport-level error occurred (e.g. network problem)
                    console.log('response.failed.error: ' + JSON.stringify(response.failed.error));
                  } else {
                    // `failure.status` is the HTTP status code
                    // `failure.response` is the JSON payload
                    console.log('response.failed: ' + JSON.stringify(response.failed));
                  }
                })
              })
            }
          }else{
            //receiver is not active and not logged out
            //check if app is terminated by user
            if(rows[0].is_app_terminated == 1){

            }else{
              //check if receiver's push is true
              if(rows[0].user_push == 1){
                //receiver's push is true, use APN to send message
                if(rows[0].device_token == '' || rows[0].device_token == null){
                  //do nothing, do not send apn
                }else{
                  var note = new apn.Notification();
                  note.sound = "ping.aiff";
                  note.topic = "MyUniversity.SekyunOh.Production.v.1.0.0";
                  note.alert = rows[0].user_nickname + " commented something"
                  note.expiry = Math.floor(Date.now() / 1000) + 3600;// Expires 1 hour from now.
                  //note.contentAvailable = 1
                  note.payload = {'object': object}
                  //note.content-available = 1;

                  apnProvider.send(note, rows[0].device_token).then( (response) => {
                    response.sent.forEach( (token) => {
                      console.log('response.sent: ' + JSON.stringify(response.sent));
                    });
                    response.failed.forEach( (failure) => {4
                      if (failure.error) {
                        // A transport-level error occurred (e.g. network problem)
                        console.log('response.failed.error: ' + JSON.stringify(response.failed.error));
                      } else {
                        // `failure.status` is the HTTP status code
                        // `failure.response` is the JSON payload
                        console.log('response.failed: ' + JSON.stringify(response.failed));

                      }
                    })
                  })
                }
              }else{
                //receiver's push is false, store the message into offlineMessage

              }
            }
          }
        }
      }else{
        //receiver unregistered, do nothing
      }
    }
  })
}



function checkIfItsDeleted(call,callback){
  //call.request.type is either 'board' or 'mentor'
  var check_if_board_deleted = 'select * from board where board_id = ?'
  var check_if_mentor_deleted = 'select * from mentor where mentor_id = ?'
  if(call.request.type == 1){
    conn.query(check_if_board_deleted,[call.request.id],function(err,rows){
      if(err){
        throw err
      }else{
        if(rows.length == 0){
          callback(null,{is_deleted:'true'})
        }else{
          callback(null,{is_deleted:'false'})
        }
      }
    })
  }else{
    //mentor
    conn.query(check_if_mentor_deleted,[call.request.id],function(err,rows){
      if(err){
        throw err
      }else{
        if(rows.length == 0){
          callback(null,{is_deleted:'true'})
        }else{
          callback(null,{is_deleted:'false'})
        }
      }
    })
  }
}

function getBoardObject(call,callback){
  var select = 'select * from board where board_id = ?'
  conn.query(select,[call.request.board_id],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null,{board:rows[0]})
    }
  })
}

function getCommentObject(call,callback){
  var select = 'select * from comment where comment_id = ?'
  conn.query(select,[call.request.comment_id],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null,{comment:rows[0]})
    }
  })
}

function getMentorObject(call,callback){
  var select = 'select dummy.* from (select @s:=@s+1 as number_id,m.* from mentor as m,(SELECT @s:= 0) as s) as dummy where dummy.mentor_id = ?'
  conn.query(select,[call.request.mentor_id],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null,{mentor:rows[0]})
    }
  })
}

function getMentorCommentObject(call,callback){
  var select = 'select * from mentor_comment where comment_id = ?'
  conn.query(select,[call.request.comment_id],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null,{comment:rows[0]})
    }
  })
}

//university.proto
function getUniversities(call,callback){
  var initUniversity = 'select university_id,name,ranking,website,address,num_of_students,tuition_fee,sat,act,application_fee,sat_act,high_school_gpa,acceptance_rate,crawling_url from university limit 0,50'
  var moreUniversity = 'select university_id,name,ranking,website,address,num_of_students,tuition_fee,sat,act,application_fee,sat_act,high_school_gpa,acceptance_rate,crawling_url from university where university_id > ? limit 0,50'

  //init
  if(call.request.university_id == 0){
    conn.query(initUniversity,function(err,rows){
      if(err){
        throw err
      }else{
        callback(null,{universities:rows})
      }
    })
  }else{
    //load more
    conn.query(moreUniversity,[call.request.university_id],function(err,rows){
      if(err){
        throw err
      }else{
        //console.log(JSON.stringify(rows));
        callback(null,{universities:rows})
      }
    })
  }
}

function getAcceptibleUniversities(call,callback){

  if(call.request.test_type == 'ACT'){
    // if(call.request.university_id == 0){
    //   //init
    // }else{
    //   //more universities as user scrolls down
    // }
    var selectAcceptibleUnivByAct = 'select university_id,name,ranking,website,address,num_of_students,tuition_fee,sat,act,application_fee,sat_act,high_school_gpa,acceptance_rate,crawling_url from university where (act_min <= ? AND act_max >= ?) or high_school_gpa <= ? limit 0,500'

    conn.query(selectAcceptibleUnivByAct,[parseInt(call.request.score),parseInt(call.request.score),parseInt(call.request.gpa_score)],function(err,rows){
      if(err){
        throw err
      }else{
        callback(null,{universities:rows})
      }
    })

  }else{
    //test_type == 'SAT'
    // if(call.request.university_id == 0){
    //   //init
    // }else{
    //   //more universities as user scrolls down
    // }
    var selectAcceptibleUnivBySat = 'select university_id,name,ranking,website,address,num_of_students,tuition_fee,sat,act,application_fee,sat_act,high_school_gpa,acceptance_rate,crawling_url from university where (sat_min <= ? AND sat_max >= ?) or high_school_gpa <= ? limit 0,500'

    conn.query(selectAcceptibleUnivBySat,[parseInt(call.request.score),parseInt(call.request.score),parseInt(call.request.gpa_score)],function(err,rows){
      if(err){
        throw err
      }else{
        callback(null,{universities:rows})
      }
    })
  }
}

function getUniversityByName(call,callback){
  var selectUnivByName = 'select university_id,name,ranking,website,address,num_of_students,tuition_fee,sat,act,application_fee,sat_act,high_school_gpa,acceptance_rate,crawling_url from university where name=?'

  conn.query(selectUnivByName,[call.request.name],function(err,rows){
    if(err){
      throw err
    }else{
      callback(null,{university:rows[0]})
    }
  })
}

//grpc setting
//server starts
server.addService(proto.Main.service, {getCaptcha: getCaptcha,userRegistration:userRegistration});
server.addService(proto.AuthorizedMain.service, {auth:auth,userLoginCheck:userLoginCheck,updateProfile:updateProfile,report:report,logout:logout,updateActive:updateActive,pushUpdate:pushUpdate,unregister:unregister,updateAppleToken:updateAppleToken,appAboutTerminating:appAboutTerminating,getOfflineMessages:getOfflineMessages,mentorRegister:mentorRegister,updateMentorInfo:updateMentorInfo,getMentors:getMentors,mentorTouch:mentorTouch,deleteMentor:deleteMentor,createBoard:createBoard,getBoards:getBoards,getMyBoards:getMyBoards,boardTouch:boardTouch,reviseMyBoard:reviseMyBoard,reviseMyReview:reviseMyReview,deleteMyBoard:deleteMyBoard,commentUpload:commentUpload,repliedCommentUpload:repliedCommentUpload,getComments:getComments,getRepliedComments:getRepliedComments,getCommentsCount:getCommentsCount,mentorCommentUpload:mentorCommentUpload,repliedMentorCommentUpload:repliedMentorCommentUpload,getMentorComments:getMentorComments,getRepliedMentorComments:getRepliedMentorComments,getMentorCommentsCount:getMentorCommentsCount,getSharedComments:getSharedComments,checkIfThereIsNewComments:checkIfThereIsNewComments,checkIfItsDeleted:checkIfItsDeleted,getBoardObject:getBoardObject,getCommentObject:getCommentObject,getMentorObject:getMentorObject,getMentorCommentObject:getMentorCommentObject,getUniversities:getUniversities,getAcceptibleUniversities:getAcceptibleUniversities,getUniversityByName:getUniversityByName});
server.bind('0.0.0.0:9000', grpc.ServerCredentials.createInsecure());

server.start();
console.log('GRPC server running on port:', '0.0.0.0:9000');
