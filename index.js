/*              ___                 ______
               /  /\               /  ___/\
        ______/  / / _______    __/  /___\/
       /  ___   / / /  ___  \  /_   __/\
      /  /\_/  / / /  /__/  /\ \/  /\_\/
     /  / //  / / /  ______/ / /  / /
    /  /_//  / / /  /______\/ /  / /
    \_______/ /  \_______/\  /__/ /
     \______\/    \______\/  \__*/

//. # sanctuary-def
//.
//. sanctuary-def is a run-time type system for JavaScript. It facilitates
//. the definition of curried JavaScript functions which are explicit about
//. the number of arguments to which they may be applied and the types of
//. those arguments.
//.
//. It is conventional to import the package as `$`:
//.
//. ```javascript
//. const $ = require('sanctuary-def');
//. ```
//.
//. The next step is to define an environment. An environment is an array
//. of [types][]. [`env`][] is an environment containing all the built-in
//. JavaScript types. It may be used as the basis for environments which
//. include custom types in addition to the built-in types:
//.
//. ```javascript
//. //    Integer :: Type
//. const Integer = ...;
//.
//. //    NonZeroInteger :: Type
//. const NonZeroInteger = ...;
//.
//. //    env :: Array Type
//. const env = $.env.concat([Integer, NonZeroInteger]);
//. ```
//.
//. The next step is to define a `def` function for the environment:
//.
//. ```javascript
//. const def = $.create({checkTypes: true, env: env});
//. ```
//.
//. The `checkTypes` option determines whether type checking is enabled.
//. This allows one to only pay the performance cost of run-time type checking
//. during development. For example:
//.
//. ```javascript
//. const def = $.create({
//.   checkTypes: process.env.NODE_ENV === 'development',
//.   env: env,
//. });
//. ```
//.
//. `def` is a function for defining functions. For example:
//.
//. ```javascript
//. //    add :: Number -> Number -> Number
//. const add =
//. def('add', {}, [$.Number, $.Number, $.Number], (x, y) => x + y);
//. ```
//.
//. `[$.Number, $.Number, $.Number]` specifies that `add` takes two arguments
//. of type `Number` and returns a value of type `Number`.
//.
//. Applying `add` to two arguments gives the expected result:
//.
//. ```javascript
//. add(2, 2);
//. // => 4
//. ```
//.
//. Applying `add` to greater than two arguments results in an exception being
//. thrown:
//.
//. ```javascript
//. add(2, 2, 2);
//. // ! TypeError: ‘add’ requires two arguments; received three arguments
//. ```
//.
//. Applying `add` to fewer than two arguments results in a function
//. awaiting the remaining arguments. This is known as partial application.
//. Partial application is convenient as it allows more specific functions
//. to be defined in terms of more general ones:
//.
//. ```javascript
//. //    inc :: Number -> Number
//. const inc = add(1);
//.
//. inc(7);
//. // => 8
//. ```
//.
//. JavaScript's implicit type coercion often obfuscates the source of type
//. errors. Consider the following function:
//.
//. ```javascript
//. //    _add :: (Number, Number) -> Number
//. const _add = (x, y) => x + y;
//. ```
//.
//. The type signature indicates that `_add` takes two arguments of type
//. `Number`, but this is not enforced. This allows type errors to be silently
//. ignored:
//.
//. ```javascript
//. _add('2', '2');
//. // => '22'
//. ```
//.
//. `add`, on the other hand, throws if applied to arguments of the wrong
//. types:
//.
//. ```javascript
//. add('2', '2');
//. // ! TypeError: Invalid value
//. //
//. //   add :: Number -> Number -> Number
//. //          ^^^^^^
//. //            1
//. //
//. //   1)  "2" :: String
//. //
//. //   The value at position 1 is not a member of ‘Number’.
//. ```
//.
//. Type checking is performed as arguments are provided (rather than once all
//. arguments have been provided), so type errors are reported early:
//.
//. ```javascript
//. add('X');
//. // ! TypeError: Invalid value
//. //
//. //   add :: Number -> Number -> Number
//. //          ^^^^^^
//. //            1
//. //
//. //   1)  "X" :: String
//. //
//. //   The value at position 1 is not a member of ‘Number’.
//. ```

(function(f) {

  'use strict';

  /* istanbul ignore else */
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = f(require('sanctuary-type-classes'));
  } else if (typeof define === 'function' && define.amd != null) {
    define(['sanctuary-type-classes'], f);
  } else {
    self.sanctuaryDef = f(self.sanctuaryTypeClasses);
  }

}(function(Z) {

  'use strict';

  var $ = {};

  //# __ :: Placeholder
  //.
  //. The special placeholder value.
  //.
  //. One may wish to partially apply a function whose parameters are in the
  //. "wrong" order. Functions defined via sanctuary-def accommodate this by
  //. accepting placeholders for arguments yet to be provided. For example:
  //.
  //. ```javascript
  //. //    concatS :: String -> String -> String
  //. const concatS =
  //. def('concatS', {}, [$.String, $.String, $.String], (x, y) => x + y);
  //.
  //. //    exclaim :: String -> String
  //. const exclaim = concatS($.__, '!');
  //.
  //. exclaim('ahoy');
  //. // => 'ahoy!'
  //. ```
  $.__ = {'@@functional/placeholder': true};

  var MAX_SAFE_INTEGER = Math.pow(2, 53) - 1;
  var MIN_SAFE_INTEGER = -MAX_SAFE_INTEGER;

  var forEach           = Array.prototype.forEach;
  var slice             = Array.prototype.slice;
  var hasOwnProperty    = Object.prototype.hasOwnProperty;
  var toString          = Object.prototype.toString;

  //  Left :: a -> Either a b
  var Left = function Left(x) {
    return {
      '@@type': 'sanctuary-def/Either',
      isLeft: true,
      isRight: false,
      'fantasy-land/chain': function(f) { return Left(x); },
      'fantasy-land/map': function(f) { return Left(x); },
      value: x
    };
  };

  //  Right :: b -> Either a b
  var Right = function Right(x) {
    return {
      '@@type': 'sanctuary-def/Either',
      isLeft: false,
      isRight: true,
      'fantasy-land/chain': function(f) { return f(x); },
      'fantasy-land/map': function(f) { return Right(f(x)); },
      value: x
    };
  };

  //  K :: a -> b -> a
  var K = function(x) { return function(y) { return x; }; };

  //  always :: a -> (-> a)
  var always = function(x) { return function() { return x; }; };

  //  always2 :: a -> (b, c) -> a
  var always2 = function(x) { return function(y, z) { return x; }; };

  //  id :: a -> a
  var id = function(x) { return x; };

  //  isEmpty :: Array a -> Boolean
  var isEmpty = function(xs) { return xs.length === 0; };

  //  isPrefix :: Array a -> Array a -> Boolean
  var isPrefix = function(candidate) {
    return function(xs) {
      if (candidate.length > xs.length) return false;
      for (var idx = 0; idx < candidate.length; idx += 1) {
        if (candidate[idx] !== xs[idx]) return false;
      }
      return true;
    };
  };

  //  last :: Array a -> a
  var last = function(xs) { return xs[xs.length - 1]; };

  //  or :: (Array a, Array a) -> Array a
  var or = function(xs, ys) { return isEmpty(xs) ? ys : xs; };

  //  range :: (Number, Number) -> Array Number
  var range = function(start, stop) {
    var result = [];
    for (var n = start; n < stop; n += 1) result.push(n);
    return result;
  };

  //  strRepeat :: (String, Integer) -> String
  var strRepeat = function(s, times) {
    return Array(times + 1).join(s);
  };

  //  r :: Char -> String -> String
  var r = function(c) {
    return function(s) {
      return strRepeat(c, s.length);
    };
  };

  //  _ :: String -> String
  var _ = r(' ');

  //  stripOutermostParens :: String -> String
  var stripOutermostParens = function(s) {
    return s.slice('('.length, -')'.length);
  };

  //  trimTrailingSpaces :: String -> String
  var trimTrailingSpaces = function(s) {
    return s.replace(/[ ]+$/gm, '');
  };

  //  unless :: (Boolean, (a -> a), a) -> a
  var unless = function(bool, f, x) {
    return bool ? x : f(x);
  };

  //  when :: (Boolean, (a -> a), a) -> a
  var when = function(bool, f, x) {
    return bool ? f(x) : x;
  };

  //  wrap :: String -> String -> String -> String
  var wrap = function(prefix) {
    return function(suffix) {
      return function(s) {
        return prefix + s + suffix;
      };
    };
  };

  //  q :: String -> String
  var q = wrap('\u2018')('\u2019');

  //  stripNamespace :: String -> String
  var stripNamespace = function(s) { return s.slice(s.indexOf('/') + 1); };

  //  createType :: ... -> Type
  var createType = function(
    typeName,   // :: String
    name,       // :: String
    format,     // :: (String -> String, String -> String -> String) -> String
    test,       // :: Any -> Boolean
    keys,       // :: Array String
    types       // :: StrMap { extractor :: a -> Array b, type :: Type }
  ) {
    var validate = function(x) {
      if (!test(x)) return Left({value: x, propPath: []});
      for (var idx = 0; idx < keys.length; idx += 1) {
        var k = keys[idx];
        var t = types[k];
        for (var idx2 = 0, ys = t.extractor(x); idx2 < ys.length; idx2 += 1) {
          var result = t.type.validate(ys[idx2]);
          if (result.isLeft) {
            var value = result.value.value;
            var propPath = Z.concat([k], result.value.propPath);
            return Left({value: value, propPath: propPath});
          }
        }
      }
      return Right(x);
    };

    return {
      '@@type': 'sanctuary-def/Type',
      _test: function(x) { return validate(x).isRight; },
      format: format,
      keys: keys,
      name: name,
      toString: always(format(id, K(id))),
      type: typeName,
      types: types,
      validate: validate
    };
  };

  var BINARY        = 'BINARY';
  var ENUM          = 'ENUM';
  var FUNCTION      = 'FUNCTION';
  var INCONSISTENT  = 'INCONSISTENT';
  var NULLARY       = 'NULLARY';
  var RECORD        = 'RECORD';
  var UNARY         = 'UNARY';
  var UNKNOWN       = 'UNKNOWN';
  var VARIABLE      = 'VARIABLE';

  //  Inconsistent :: Type
  var Inconsistent =
  createType(INCONSISTENT, '', always2('???'), K(false), [], {});

  //  $$type :: a -> String
  var $$type = function(x) {
    return x != null && toString.call(x['@@type']) === '[object String]' ?
      x['@@type'] :
      toString.call(x).slice('[object '.length, -']'.length);
  };

  //  $$typeEq :: String -> a -> Boolean
  var $$typeEq = function(name) {
    return function(x) {
      return $$type(x) === name;
    };
  };

  //  type0 :: String -> Type
  var type0 = function(name) {
    return NullaryType(name, $$typeEq(name));
  };

  //  type1 :: (String, (t a -> Array a)) -> Type -> Type
  var type1 = function(name, _1) {
    return UnaryType(name, $$typeEq(name), _1);
  };

  //  applyParameterizedTypes :: Array Type -> Array Type
  var applyParameterizedTypes = function(types) {
    return Z.map(function(x) {
      return typeof x === 'function' ?
        x.apply(null, Z.map(K($.Unknown), range(0, x.length))) :
        x;
    }, types);
  };

  //. ### Types
  //.
  //. Conceptually, a type is a set of values. One can think of a value of
  //. type `Type` as a function of type `Any -> Boolean` which tests values
  //. for membership in the set (though this is an oversimplification).

  //# Any :: Type
  //.
  //. Type comprising every JavaScript value.
  $.Any = NullaryType('sanctuary-def/Any', K(true));

  //# AnyFunction :: Type
  //.
  //. Type comprising every Function value.
  $.AnyFunction = type0('Function');

  //# Arguments :: Type
  //.
  //. Type comprising every [`arguments`][arguments] object.
  $.Arguments = type0('Arguments');

  //# Array :: Type -> Type
  //.
  //. Constructor for homogeneous Array types.
  $.Array = type1('Array', id);

  //# Boolean :: Type
  //.
  //. Type comprising `true` and `false` (and their object counterparts).
  $.Boolean = type0('Boolean');

  //# Date :: Type
  //.
  //. Type comprising every Date value.
  $.Date = type0('Date');

  //# Error :: Type
  //.
  //. Type comprising every Error value, including values of more specific
  //. constructors such as [`SyntaxError`][] and [`TypeError`][].
  $.Error = type0('Error');

  //# FiniteNumber :: Type
  //.
  //. Type comprising every [`ValidNumber`][] value except `Infinity` and
  //. `-Infinity` (and their object counterparts).
  $.FiniteNumber = NullaryType(
    'sanctuary-def/FiniteNumber',
    function(x) { return $.ValidNumber._test(x) && isFinite(x); }
  );

  //# Function :: Array Type -> Type
  //.
  //. Constructor for Function types.
  //.
  //. Examples:
  //.
  //.   - `$.Function([$.Date, $.String])` represents the `Date -> String`
  //.     type; and
  //.   - `$.Function([a, b, a])` represents the `(a, b) -> a` type.
  $.Function = function(types) {
    var format = function(outer, inner) {
      var xs = types.map(function(t, idx) {
        return unless(t.type === RECORD || isEmpty(t.keys),
                      stripOutermostParens,
                      inner('$' + String(idx + 1))(String(t)));
      });
      var parenthesize = wrap(outer('('))(outer(')'));
      return parenthesize(unless(types.length === 2,
                                 parenthesize,
                                 xs.slice(0, -1).join(outer(', '))) +
                          outer(' -> ') +
                          last(xs));
    };

    var test = $.AnyFunction._test;

    var $keys = [];
    var $types = {};
    types.forEach(function(t, idx) {
      var k = '$' + String(idx + 1);
      $keys.push(k);
      $types[k] = {extractor: K([]), type: t};
    });

    return createType(FUNCTION, '', format, test, $keys, $types);
  };

  //# GlobalRegExp :: Type
  //.
  //. Type comprising every [`RegExp`][] value whose `global` flag is `true`.
  //.
  //. See also [`NonGlobalRegExp`][].
  $.GlobalRegExp = NullaryType(
    'sanctuary-def/GlobalRegExp',
    function(x) { return $.RegExp._test(x) && x.global; }
  );

  //# Integer :: Type
  //.
  //. Type comprising every integer in the range
  //. [[`Number.MIN_SAFE_INTEGER`][min] .. [`Number.MAX_SAFE_INTEGER`][max]].
  $.Integer = NullaryType(
    'sanctuary-def/Integer',
    function(x) {
      return $.ValidNumber._test(x) &&
             Math.floor(x) == x &&  // eslint-disable-line eqeqeq
             x >= MIN_SAFE_INTEGER &&
             x <= MAX_SAFE_INTEGER;
    }
  );

  //# NegativeFiniteNumber :: Type
  //.
  //. Type comprising every [`FiniteNumber`][] value less than zero.
  $.NegativeFiniteNumber = NullaryType(
    'sanctuary-def/NegativeFiniteNumber',
    function(x) { return $.FiniteNumber._test(x) && x < 0; }
  );

  //# NegativeInteger :: Type
  //.
  //. Type comprising every [`Integer`][] value less than zero.
  $.NegativeInteger = NullaryType(
    'sanctuary-def/NegativeInteger',
    function(x) { return $.Integer._test(x) && x < 0; }
  );

  //# NegativeNumber :: Type
  //.
  //. Type comprising every [`Number`][] value less than zero.
  $.NegativeNumber = NullaryType(
    'sanctuary-def/NegativeNumber',
    function(x) { return $.Number._test(x) && x < 0; }
  );

  //# NonGlobalRegExp :: Type
  //.
  //. Type comprising every [`RegExp`][] value whose `global` flag is `false`.
  //.
  //. See also [`GlobalRegExp`][].
  $.NonGlobalRegExp = NullaryType(
    'sanctuary-def/NonGlobalRegExp',
    function(x) { return $.RegExp._test(x) && !x.global; }
  );

  //# NonZeroFiniteNumber :: Type
  //.
  //. Type comprising every [`FiniteNumber`][] value except `0` and `-0`
  //. (and their object counterparts).
  $.NonZeroFiniteNumber = NullaryType(
    'sanctuary-def/NonZeroFiniteNumber',
    function(x) {
      return $.FiniteNumber._test(x) && x != 0;  // eslint-disable-line eqeqeq
    }
  );

  //# NonZeroInteger :: Type
  //.
  //. Type comprising every non-zero [`Integer`][] value.
  $.NonZeroInteger = NullaryType(
    'sanctuary-def/NonZeroInteger',
    function(x) {
      return $.Integer._test(x) && x != 0;  // eslint-disable-line eqeqeq
    }
  );

  //# NonZeroValidNumber :: Type
  //.
  //. Type comprising every [`ValidNumber`][] value except `0` and `-0`
  //. (and their object counterparts).
  $.NonZeroValidNumber = NullaryType(
    'sanctuary-def/NonZeroValidNumber',
    function(x) {
      return $.ValidNumber._test(x) && x != 0;  // eslint-disable-line eqeqeq
    }
  );

  //# Null :: Type
  //.
  //. Type whose sole member is `null`.
  $.Null = type0('Null');

  //# Nullable :: Type -> Type
  //.
  //. Constructor for types which include `null` as a member.
  $.Nullable = UnaryType(
    'sanctuary-def/Nullable',
    K(true),
    function(nullable) { return nullable === null ? [] : [nullable]; }
  );

  //# Number :: Type
  //.
  //. Type comprising every Number value (including `NaN` and Number objects).
  $.Number = type0('Number');

  //# Object :: Type
  //.
  //. Type comprising every "plain" Object value. Specifically, values
  //. created via:
  //.
  //.   - object literal syntax;
  //.   - [`Object.create`][]; or
  //.   - the `new` operator in conjunction with `Object` or a custom
  //.     constructor function.
  $.Object = type0('Object');

  //# Pair :: (Type, Type) -> Type
  //.
  //. Constructor for tuple types of length 2. Arrays are said to represent
  //. tuples. `['foo', 42]` is a member of `Pair String Number`.
  $.Pair = BinaryType(
    'sanctuary-def/Pair',
    function(x) { return $$typeEq('Array')(x) && x.length === 2; },
    function(pair) { return [pair[0]]; },
    function(pair) { return [pair[1]]; }
  );

  //# PositiveFiniteNumber :: Type
  //.
  //. Type comprising every [`FiniteNumber`][] value greater than zero.
  $.PositiveFiniteNumber = NullaryType(
    'sanctuary-def/PositiveFiniteNumber',
    function(x) { return $.FiniteNumber._test(x) && x > 0; }
  );

  //# PositiveInteger :: Type
  //.
  //. Type comprising every [`Integer`][] value greater than zero.
  $.PositiveInteger = NullaryType(
    'sanctuary-def/PositiveInteger',
    function(x) { return $.Integer._test(x) && x > 0; }
  );

  //# PositiveNumber :: Type
  //.
  //. Type comprising every [`Number`][] value greater than zero.
  $.PositiveNumber = NullaryType(
    'sanctuary-def/PositiveNumber',
    function(x) { return $.Number._test(x) && x > 0; }
  );

  //# RegExp :: Type
  //.
  //. Type comprising every RegExp value.
  $.RegExp = type0('RegExp');

  //# RegexFlags :: Type
  //.
  //. Type comprising the canonical RegExp flags:
  //.
  //.   - `''`
  //.   - `'g'`
  //.   - `'i'`
  //.   - `'m'`
  //.   - `'gi'`
  //.   - `'gm'`
  //.   - `'im'`
  //.   - `'gim'`
  $.RegexFlags = EnumType(['', 'g', 'i', 'm', 'gi', 'gm', 'im', 'gim']);

  //# StrMap :: Type -> Type
  //.
  //. Constructor for homogeneous Object types.
  //.
  //. `{foo: 1, bar: 2, baz: 3}`, for example, is a member of `StrMap Number`;
  //. `{foo: 1, bar: 2, baz: 'XXX'}` is not.
  $.StrMap = UnaryType(
    'sanctuary-def/StrMap',
    function(x) { return $.Object._test(x); },
    function(strMap) {
      return Z.map(function(k) { return strMap[k]; },
                   Object.keys(strMap).sort());
    }
  );

  //# String :: Type
  //.
  //. Type comprising every String value (including String objects).
  $.String = type0('String');

  //# Undefined :: Type
  //.
  //. Type whose sole member is `undefined`.
  $.Undefined = type0('Undefined');

  //# Unknown :: Type
  //.
  //. Type used internally to represent missing type information. The type of
  //. `[]`, for example, is `Array ???`. This type is exported solely for use
  //. by other Sanctuary packages.
  $.Unknown = createType(UNKNOWN, '', always2('???'), K(true), [], {});

  //# ValidDate :: Type
  //.
  //. Type comprising every [`Date`][] value except `new Date(NaN)`.
  $.ValidDate = NullaryType(
    'sanctuary-def/ValidDate',
    function(x) { return $.Date._test(x) && !isNaN(x.valueOf()); }
  );

  //# ValidNumber :: Type
  //.
  //. Type comprising every [`Number`][] value except `NaN` (and its object
  //. counterpart).
  $.ValidNumber = NullaryType(
    'sanctuary-def/ValidNumber',
    function(x) { return $.Number._test(x) && !isNaN(x); }
  );

  //# env :: Array Type
  //.
  //. An array of [types][]:
  //.
  //.   - [`AnyFunction`][]
  //.   - [`Arguments`][]
  //.   - [`Array`][]
  //.   - [`Boolean`][]
  //.   - [`Date`][]
  //.   - [`Error`][]
  //.   - [`Null`][]
  //.   - [`Number`][]
  //.   - [`Object`][]
  //.   - [`RegExp`][]
  //.   - [`StrMap`][]
  //.   - [`String`][]
  //.   - [`Undefined`][]
  $.env = applyParameterizedTypes([
    $.AnyFunction,
    $.Arguments,
    $.Array,
    $.Boolean,
    $.Date,
    $.Error,
    $.Null,
    $.Number,
    $.Object,
    $.RegExp,
    $.StrMap,
    $.String,
    $.Undefined
  ]);

  //  Type :: Type
  var Type = type0('sanctuary-def/Type');

  //  TypeClass :: Type
  var TypeClass = type0('sanctuary-type-classes/TypeClass');

  //  arity :: (Number, Function) -> Function
  var arity = function(n, f) {
    return (
      n === 0 ?
        function() {
          return f.apply(this, arguments);
        } :
      n === 1 ?
        function($1) {
          return f.apply(this, arguments);
        } :
      n === 2 ?
        function($1, $2) {
          return f.apply(this, arguments);
        } :
      n === 3 ?
        function($1, $2, $3) {
          return f.apply(this, arguments);
        } :
      n === 4 ?
        function($1, $2, $3, $4) {
          return f.apply(this, arguments);
        } :
      n === 5 ?
        function($1, $2, $3, $4, $5) {
          return f.apply(this, arguments);
        } :
      n === 6 ?
        function($1, $2, $3, $4, $5, $6) {
          return f.apply(this, arguments);
        } :
      n === 7 ?
        function($1, $2, $3, $4, $5, $6, $7) {
          return f.apply(this, arguments);
        } :
      n === 8 ?
        function($1, $2, $3, $4, $5, $6, $7, $8) {
          return f.apply(this, arguments);
        } :
      // else
        function($1, $2, $3, $4, $5, $6, $7, $8, $9) {
          return f.apply(this, arguments);
        }
    );
  };

  //  numArgs :: Number -> String
  var numArgs = function(n) {
    switch (n) {
      case  0:  return  'zero arguments';
      case  1:  return   'one argument';
      case  2:  return   'two arguments';
      case  3:  return 'three arguments';
      case  4:  return  'four arguments';
      case  5:  return  'five arguments';
      case  6:  return   'six arguments';
      case  7:  return 'seven arguments';
      case  8:  return 'eight arguments';
      case  9:  return  'nine arguments';
      default:  return  n + ' arguments';
    }
  };

  //  _determineActualTypes :: ... -> Array Type
  var _determineActualTypes = function recur(
    loose,          // :: Boolean
    env,            // :: Array Type
    types,          // :: Array Type
    seen,           // :: Array Object
    values          // :: Array Any
  ) {
    var refine = function(types, value) {
      var seen$;
      if (typeof value === 'object' && value != null ||
          typeof value === 'function') {
        //  Abort if a circular reference is encountered; add the current
        //  object to the array of seen objects otherwise.
        if (seen.indexOf(value) >= 0) return [];
        seen$ = Z.concat(seen, [value]);
      } else {
        seen$ = seen;
      }
      return Z.chain(function(t) {
        return (
          t.name === 'sanctuary-def/Nullable' || !t._test(value) ?
            [] :
          t.type === UNARY ?
            Z.map(fromUnaryType(t),
                  recur(loose, env, env, seen$, t.types.$1.extractor(value))) :
          t.type === BINARY ?
            xprod(
              t,
              t.types.$1.type.type === UNKNOWN ?
                recur(loose, env, env, seen$, t.types.$1.extractor(value)) :
                [t.types.$1.type],
              t.types.$2.type.type === UNKNOWN ?
                recur(loose, env, env, seen$, t.types.$2.extractor(value)) :
                [t.types.$2.type]
            ) :
          // else
            [t]
        );
      }, types);
    };

    return isEmpty(values) ?
      [$.Unknown] :
      or(Z.reduce(refine, types, values), loose ? [Inconsistent] : []);
  };

  //  rejectInconsistent :: Array Type -> Array Type
  var rejectInconsistent = function(types) {
    return types.filter(function(t) {
      return t.type !== INCONSISTENT && t.type !== UNKNOWN;
    });
  };

  //  determineActualTypesStrict ::
  //    (Array Type, Array Type, Array Any) -> Array Type
  var determineActualTypesStrict = function(env, types, values) {
    var types$ = _determineActualTypes(false, env, types, [], values);
    return rejectInconsistent(types$);
  };

  //  determineActualTypesLoose ::
  //    (Array Type, Array Type, Array Any) -> Array Type
  var determineActualTypesLoose = function(env, types, values) {
    var types$ = _determineActualTypes(true, env, types, [], values);
    return rejectInconsistent(types$);
  };

  //  TypeInfo = { name :: String
  //             , constraints :: StrMap (Array TypeClass)
  //             , types :: Array Type }
  //
  //  TypeVarMap = StrMap { types :: Array Type
  //                      , valuesByPath :: StrMap (Array Any) }
  //
  //  PropPath = Array (Number | String)

  //  updateTypeVarMap :: ... -> TypeVarMap
  var updateTypeVarMap = function(
    env,            // :: Array Type
    typeVarMap,     // :: TypeVarMap
    typeVar,        // :: Type
    index,          // :: Integer
    propPath,       // :: PropPath
    values          // :: Array Any
  ) {
    var $typeVarMap = {};
    for (var typeVarName in typeVarMap) {
      var entry = typeVarMap[typeVarName];
      var $entry = {types: entry.types.slice(), valuesByPath: {}};
      for (var k in entry.valuesByPath) {
        $entry.valuesByPath[k] = entry.valuesByPath[k].slice();
      }
      $typeVarMap[typeVarName] = $entry;
    }
    if (!hasOwnProperty.call($typeVarMap, typeVar.name)) {
      $typeVarMap[typeVar.name] = {types: env.slice(), valuesByPath: {}};
    }

    var key = JSON.stringify(Z.concat([index], propPath));
    if (!hasOwnProperty.call($typeVarMap[typeVar.name].valuesByPath, key)) {
      $typeVarMap[typeVar.name].valuesByPath[key] = [];
    }

    values.forEach(function(value) {
      $typeVarMap[typeVar.name].valuesByPath[key].push(value);
      $typeVarMap[typeVar.name].types = Z.chain(
        function(t) {
          var xs;
          var invalid = !$.test(env, t, value);
          return (
            invalid ?
              [] :
            typeVar.keys.length > 0 ?
              [t].filter(function(t) {
                return (
                  t.type !== RECORD &&
                  t.keys.length >= typeVar.keys.length &&
                  t.keys.slice(-typeVar.keys.length).every(function(k) {
                    var xs = t.types[k].extractor(value);
                    return isEmpty(xs) ||
                           !isEmpty(determineActualTypesStrict(env, env, xs));
                  })
                );
              }) :
            t.type === UNARY ?
              t.types.$1.type.type === UNKNOWN &&
              !isEmpty(xs = t.types.$1.extractor(value)) ?
                Z.map(fromUnaryType(t),
                      determineActualTypesStrict(env, env, xs)) :
                [t] :
            t.type === BINARY ?
              xprod(t,
                    t.types.$1.type.type === UNKNOWN &&
                    !isEmpty(xs = t.types.$1.extractor(value)) ?
                      determineActualTypesStrict(env, env, xs) :
                      [t.types.$1.type],
                    t.types.$2.type.type === UNKNOWN &&
                    !isEmpty(xs = t.types.$2.extractor(value)) ?
                      determineActualTypesStrict(env, env, xs) :
                      [t.types.$2.type]) :
            // else
              [t]
          );
        },
        $typeVarMap[typeVar.name].types
      );
    });

    return $typeVarMap;
  };

  //  underlineTypeVars :: (TypeInfo, StrMap (Array Any)) -> String
  var underlineTypeVars = function(typeInfo, valuesByPath) {
    //  Note: Sorting these keys lexicographically is not "correct", but it
    //  does the right thing for indexes less than 10.
    var paths = Z.map(JSON.parse, Object.keys(valuesByPath).sort());
    return underline(
      typeInfo,
      K(K(_)),
      function(index) {
        return function(f) {
          return function(t) {
            return function(propPath) {
              var indexedPropPath = Z.concat([index], propPath);
              return function(s) {
                if (t.type === VARIABLE) {
                  var key = JSON.stringify(indexedPropPath);
                  var exists = hasOwnProperty.call(valuesByPath, key);
                  return (exists && !isEmpty(valuesByPath[key]) ? f : _)(s);
                } else {
                  return unless(paths.some(isPrefix(indexedPropPath)), _, s);
                }
              };
            };
          };
        };
      }
    );
  };

  //  satisfactoryTypes ::
  //    ... -> Either (() -> Error) { typeVarMap :: TypeVarMap
  //                                , types :: Array Type }
  var satisfactoryTypes = function recur(
    env,            // :: Array Type
    typeInfo,       // :: TypeInfo
    typeVarMap,     // :: TypeVarMap
    expType,        // :: Type
    index,          // :: Integer
    propPath,       // :: PropPath
    values          // :: Array Any
  ) {
    for (var idx = 0; idx < values.length; idx += 1) {
      var result = expType.validate(values[idx]);
      if (result.isLeft) {
        return Left(function() {
          return invalidValue(env,
                              typeInfo,
                              index,
                              result.value.propPath,
                              result.value.value);
        });
      }
    }

    switch (expType.type) {

      case VARIABLE:
        var typeVarName = expType.name;
        var constraints = typeInfo.constraints;
        if (hasOwnProperty.call(constraints, typeVarName)) {
          var typeClasses = constraints[typeVarName];
          for (idx = 0; idx < values.length; idx += 1) {
            for (var idx2 = 0; idx2 < typeClasses.length; idx2 += 1) {
              if (!typeClasses[idx2].test(values[idx])) {
                return Left(function() {
                  return typeClassConstraintViolation(
                    env,
                    typeInfo,
                    typeClasses[idx2],
                    index,
                    propPath,
                    values[idx],
                    typeVarMap
                  );
                });
              }
            }
          }
        }

        var typeVarMap$ = updateTypeVarMap(env,
                                           typeVarMap,
                                           expType,
                                           index,
                                           propPath,
                                           values);

        var okTypes = typeVarMap$[typeVarName].types;
        return isEmpty(okTypes) && !isEmpty(values) ?
          Left(function() {
            return typeVarConstraintViolation(
              env,
              typeInfo,
              index,
              propPath,
              typeVarMap$[typeVarName].valuesByPath
            );
          }) :
          Z.reduce(function(e, t) {
            return isEmpty(expType.keys) || isEmpty(t.keys) ?
              e :
              Z.chain(function(r) {
                var $1 = expType.types[expType.keys[0]].type;
                var k = last(t.keys);
                var innerValues = Z.chain(t.types[k].extractor, values);
                return Z.reduce(function(e, x) {
                  return Z.chain(function(r) {
                    return $1.type === VARIABLE || $.test(env, $1, x) ?
                      Right(r) :
                      Left(function() {
                        return invalidValue(env,
                                            typeInfo,
                                            index,
                                            Z.concat(propPath, [k]),
                                            x);
                      });
                  }, e);
                }, Right(r), innerValues);
              }, e);
          }, Right({typeVarMap: typeVarMap$, types: okTypes}), okTypes);

      case UNARY:
        return Z.map(
          function(result) {
            return {
              typeVarMap: result.typeVarMap,
              types: Z.map(fromUnaryType(expType),
                           or(result.types, [expType.types.$1.type]))
            };
          },
          recur(env,
                typeInfo,
                typeVarMap,
                expType.types.$1.type,
                index,
                Z.concat(propPath, ['$1']),
                Z.chain(expType.types.$1.extractor, values))
        );

      case BINARY:
        return Z.chain(
          function(result) {
            var $1s = result.types;
            return Z.map(
              function(result) {
                var $2s = result.types;
                return {
                  typeVarMap: result.typeVarMap,
                  types: xprod(expType,
                               or($1s, [expType.types.$1.type]),
                               or($2s, [expType.types.$2.type]))
                };
              },
              recur(env,
                    typeInfo,
                    result.typeVarMap,
                    expType.types.$2.type,
                    index,
                    Z.concat(propPath, ['$2']),
                    Z.chain(expType.types.$2.extractor, values))
            );
          },
          recur(env,
                typeInfo,
                typeVarMap,
                expType.types.$1.type,
                index,
                Z.concat(propPath, ['$1']),
                Z.chain(expType.types.$1.extractor, values))
        );

      case RECORD:
        return Z.reduce(function(e, k) {
          return Z.chain(function(r) {
            return recur(env,
                         typeInfo,
                         r.typeVarMap,
                         expType.types[k].type,
                         index,
                         Z.concat(propPath, [k]),
                         Z.chain(expType.types[k].extractor, values));
          }, e);
        }, Right({typeVarMap: typeVarMap, types: [expType]}), expType.keys);

      default:
        return Right({typeVarMap: typeVarMap, types: [expType]});
    }
  };

  //# test :: (Array Type, Type, a) -> Boolean
  //.
  //. Takes an environment, a type, and any value. Returns `true` if the value
  //. is a member of the type; `false` otherwise.
  //.
  //. The environment is only significant if the type contains
  //. [type variables][].
  //.
  //. One may define a more restrictive type in terms of a more general one:
  //.
  //. ```javascript
  //. //    NonNegativeInteger :: Type
  //. const NonNegativeInteger = $.NullaryType(
  //.   'my-package/NonNegativeInteger',
  //.   x => $.test([], $.Integer, x) && x >= 0
  //. );
  //. ```
  //.
  //. Using types as predicates is useful in other contexts too. One could,
  //. for example, define a [record type][] for each endpoint of a REST API
  //. and validate the bodies of incoming POST requests against these types.
  $.test = function(_env, t, x) {
    var env = applyParameterizedTypes(_env);
    var typeInfo = {name: 'name', constraints: {}, types: [t]};
    return satisfactoryTypes(env, typeInfo, {}, t, 0, [], [x]).isRight;
  };

  //. ### Type constructors
  //.
  //. sanctuary-def provides several functions for defining types.

  //# NullaryType :: (String, Any -> Boolean) -> Type
  //.
  //. Type constructor for types with no type variables (such as [`Number`][]).
  //.
  //. To define a nullary type `t` one must provide:
  //.
  //.   - the name of `t` (exposed as `t.name`); and
  //.
  //.   - a predicate which accepts any JavaScript value and returns `true` if
  //.     (and only if) the value is a member of `t`.
  //.
  //. For example:
  //.
  //. ```javascript
  //. //    Integer :: Type
  //. const Integer = $.NullaryType(
  //.   'my-package/Integer',
  //.   x => Object.prototype.toString.call(x) === '[object Number]' &&
  //.        Math.floor(x) === Number(x) &&
  //.        x >= Number.MIN_SAFE_INTEGER &&
  //.        x <= Number.MAX_SAFE_INTEGER
  //. );
  //.
  //. //    NonZeroInteger :: Type
  //. const NonZeroInteger = $.NullaryType(
  //.   'my-package/NonZeroInteger',
  //.   x => $.test([], Integer, x) && Number(x) !== 0
  //. );
  //.
  //. //    rem :: Integer -> NonZeroInteger -> Integer
  //. const rem =
  //. def('rem', {}, [Integer, NonZeroInteger, Integer], (x, y) => x % y);
  //.
  //. rem(42, 5);
  //. // => 2
  //.
  //. rem(0.5);
  //. // ! TypeError: Invalid value
  //. //
  //. //   rem :: Integer -> NonZeroInteger -> Integer
  //. //          ^^^^^^^
  //. //             1
  //. //
  //. //   1)  0.5 :: Number
  //. //
  //. //   The value at position 1 is not a member of ‘Integer’.
  //.
  //. rem(42, 0);
  //. // ! TypeError: Invalid value
  //. //
  //. //   rem :: Integer -> NonZeroInteger -> Integer
  //. //                     ^^^^^^^^^^^^^^
  //. //                           1
  //. //
  //. //   1)  0 :: Number
  //. //
  //. //   The value at position 1 is not a member of ‘NonZeroInteger’.
  //. ```
  function NullaryType(name, test) {
    var format = function(outer, inner) {
      return outer(stripNamespace(name));
    };
    return createType(NULLARY, name, format, test, [], {});
  }
  $.NullaryType = NullaryType;

  //# UnaryType :: (String, Any -> Boolean, t a -> Array a) -> (Type -> Type)
  //.
  //. Type constructor for types with one type variable (such as [`Array`][]).
  //.
  //. To define a unary type `t a` one must provide:
  //.
  //.   - the name of `t` (exposed as `t.name`);
  //.
  //.   - a predicate which accepts any JavaScript value and returns `true`
  //.     if (and only if) the value is a member of `t x` for some type `x`;
  //.
  //.   - a function which takes any value of type `t a` and returns an array
  //.     of the values of type `a` contained in the `t` (exposed as
  //.     `t.types.$1.extractor`); and
  //.
  //.   - the type of `a` (exposed as `t.types.$1.type`).
  //.
  //. For example:
  //.
  //. ```javascript
  //. //    Maybe :: Type -> Type
  //. const Maybe = $.UnaryType(
  //.   'my-package/Maybe',
  //.   x => x != null && x['@@type'] === 'my-package/Maybe',
  //.   maybe => maybe.isJust ? [maybe.value] : []
  //. );
  //.
  //. //    Nothing :: Maybe a
  //. const Nothing = {
  //.   '@@type': 'my-package/Maybe',
  //.   isJust: false,
  //.   isNothing: true,
  //.   toString: () => 'Nothing',
  //. };
  //.
  //. //    Just :: a -> Maybe a
  //. const Just = x => ({
  //.   '@@type': 'my-package/Maybe',
  //.   isJust: true,
  //.   isNothing: false,
  //.   toString: () => 'Just(' + Z.toString(x) + ')',
  //.   value: x,
  //. });
  //.
  //. //    fromMaybe :: a -> Maybe a -> a
  //. const fromMaybe =
  //. def('fromMaybe', {}, [a, Maybe(a), a], (x, m) => m.isJust ? m.value : x);
  //.
  //. fromMaybe(0, Just(42));
  //. // => 42
  //.
  //. fromMaybe(0, Nothing);
  //. // => 0
  //.
  //. fromMaybe(0, Just('XXX'));
  //. // ! TypeError: Type-variable constraint violation
  //. //
  //. //   fromMaybe :: a -> Maybe a -> a
  //. //                ^          ^
  //. //                1          2
  //. //
  //. //   1)  0 :: Number
  //. //
  //. //   2)  "XXX" :: String
  //. //
  //. //   Since there is no type of which all the above values are members, the type-variable constraint has been violated.
  //. ```
  function UnaryType(name, test, _1) {
    return function($1) {
      var format = function(outer, inner) {
        return outer('(' + stripNamespace(name) + ' ') +
               inner('$1')(String($1)) + outer(')');
      };
      var types = {$1: {extractor: _1, type: $1}};
      return createType(UNARY, name, format, test, ['$1'], types);
    };
  }
  $.UnaryType = UnaryType;

  //  fromUnaryType :: Type -> (Type -> Type)
  var fromUnaryType = function(t) {
    return UnaryType(t.name, t._test, t.types.$1.extractor);
  };

  //# BinaryType :: (String, Any -> Boolean, t a b -> Array a, t a b -> Array b) -> ((Type, Type) -> Type)
  //.
  //. Type constructor for types with two type variables (such as [`Pair`][]).
  //.
  //. To define a binary type `t a b` one must provide:
  //.
  //.   - the name of `t` (exposed as `t.name`);
  //.
  //.   - a predicate which accepts any JavaScript value and returns `true`
  //.     if (and only if) the value is a member of `t x y` for some types
  //.     `x` and `y`;
  //.
  //.   - a function which takes any value of type `t a b` and returns an array
  //.     of the values of type `a` contained in the `t` (exposed as
  //.     `t.types.$1.extractor`);
  //.
  //.   - a function which takes any value of type `t a b` and returns an array
  //.     of the values of type `b` contained in the `t` (exposed as
  //.     `t.types.$2.extractor`);
  //.
  //.   - the type of `a` (exposed as `t.types.$1.type`); and
  //.
  //.   - the type of `b` (exposed as `t.types.$2.type`).
  //.
  //. For example:
  //.
  //. ```javascript
  //. //    $Pair :: Type -> Type -> Type
  //. const $Pair = $.BinaryType(
  //.   'my-package/Pair',
  //.   x => x != null && x['@@type'] === 'my-package/Pair',
  //.   pair => [pair[0]],
  //.   pair => [pair[1]]
  //. );
  //.
  //. //    Pair :: a -> b -> Pair a b
  //. const Pair = def('Pair', {}, [a, b, $Pair(a, b)], (x, y) => ({
  //.   '0': x,
  //.   '1': y,
  //.   '@@type': 'my-package/Pair',
  //.   length: 2,
  //.   toString: () => 'Pair(' + Z.toString(x) + ', ' + Z.toString(y) + ')',
  //. }));
  //.
  //. //    Rank :: Type
  //. const Rank = $.NullaryType(
  //.   'my-package/Rank',
  //.   x => typeof x === 'string' && /^([A23456789JQK]|10)$/.test(x),
  //.   'A'
  //. );
  //.
  //. //    Suit :: Type
  //. const Suit = $.NullaryType(
  //.   'my-package/Suit',
  //.   x => typeof x === 'string' && /^[\u2660\u2663\u2665\u2666]$/.test(x),
  //.   '\u2660'
  //. );
  //.
  //. //    Card :: Type
  //. const Card = $Pair(Rank, Suit);
  //.
  //. //    showCard :: Card -> String
  //. const showCard =
  //. def('showCard', {}, [Card, $.String], card => card[0] + card[1]);
  //.
  //. showCard(Pair('A', '♠'));
  //. // => 'A♠'
  //.
  //. showCard(Pair('X', '♠'));
  //. // ! TypeError: Invalid value
  //. //
  //. //   showCard :: Pair Rank Suit -> String
  //. //                    ^^^^
  //. //                     1
  //. //
  //. //   1)  "X" :: String
  //. //
  //. //   The value at position 1 is not a member of ‘Rank’.
  //. ```
  function BinaryType(name, test, _1, _2) {
    return function($1, $2) {
      var format = function(outer, inner) {
        return outer('(' + stripNamespace(name) + ' ') +
               inner('$1')(String($1)) + outer(' ') +
               inner('$2')(String($2)) + outer(')');
      };
      var types = {$1: {extractor: _1, type: $1},
                   $2: {extractor: _2, type: $2}};
      return createType(BINARY, name, format, test, ['$1', '$2'], types);
    };
  }
  $.BinaryType = BinaryType;

  //  xprod :: (Type, Array Type, Array Type) -> Array Type
  var xprod = function(t, $1s, $2s) {
    var specialize = BinaryType(t.name,
                                t._test,
                                t.types.$1.extractor,
                                t.types.$2.extractor);
    var $types = [];
    $1s.forEach(function($1) {
      $2s.forEach(function($2) {
        $types.push(specialize($1, $2));
      });
    });
    return $types;
  };

  //# EnumType :: Array Any -> Type
  //.
  //. `EnumType` is used to construct [enumerated types][].
  //.
  //. To define an enumerated type one must provide:
  //.
  //.   - an array of distinct values.
  //.
  //. For example:
  //.
  //. ```javascript
  //. //    TimeUnit :: Type
  //. const TimeUnit =
  //. $.EnumType(['milliseconds', 'seconds', 'minutes', 'hours']);
  //.
  //. //    convertTo :: TimeUnit -> ValidDate -> ValidNumber
  //. const convertTo =
  //. def('convertTo',
  //.     {},
  //.     [TimeUnit, $.ValidDate, $.ValidNumber],
  //.     function recur(unit, date) {
  //.       switch (unit) {
  //.         case 'milliseconds': return date.valueOf();
  //.         case 'seconds':      return recur('milliseconds', date) / 1000;
  //.         case 'minutes':      return recur('seconds', date) / 60;
  //.         case 'hours':        return recur('minutes', date) / 60;
  //.       }
  //.     });
  //.
  //. convertTo('seconds', new Date(1000));
  //. // => 1
  //.
  //. convertTo('days', new Date(1000));
  //. // ! TypeError: Invalid value
  //. //
  //. //   convertTo :: ("milliseconds" | "seconds" | "minutes" | "hours") -> ValidDate -> ValidNumber
  //. //                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //. //                                        1
  //. //
  //. //   1)  "days" :: String
  //. //
  //. //   The value at position 1 is not a member of ‘("milliseconds" | "seconds" | "minutes" | "hours")’.
  //. ```
  function EnumType(members) {
    var format = function(outer, inner) {
      return outer('(' + Z.map(Z.toString, members).join(' | ') + ')');
    };

    var test = function(x) {
      return members.some(function(member) { return Z.equals(x, member); });
    };

    return createType(ENUM, '', format, test, [], {});
  }
  $.EnumType = EnumType;

  //# RecordType :: StrMap Type -> Type
  //.
  //. `RecordType` is used to construct record types. The type definition
  //. specifies the name and type of each required field.
  //.
  //. To define a record type one must provide:
  //.
  //.   - an object mapping field name to type.
  //.
  //. For example:
  //.
  //. ```javascript
  //. //    Point :: Type
  //. const Point = $.RecordType({x: $.FiniteNumber, y: $.FiniteNumber});
  //.
  //. //    dist :: Point -> Point -> FiniteNumber
  //. const dist =
  //. def('dist', {}, [Point, Point, $.FiniteNumber],
  //.     (p, q) => Math.sqrt(Math.pow(p.x - q.x, 2) +
  //.                         Math.pow(p.y - q.y, 2)));
  //.
  //. dist({x: 0, y: 0}, {x: 3, y: 4});
  //. // => 5
  //.
  //. dist({x: 0, y: 0}, {x: 3, y: 4, color: 'red'});
  //. // => 5
  //.
  //. dist({x: 0, y: 0}, {x: NaN, y: NaN});
  //. // ! TypeError: Invalid value
  //. //
  //. //   dist :: { x :: FiniteNumber, y :: FiniteNumber } -> { x :: FiniteNumber, y :: FiniteNumber } -> FiniteNumber
  //. //                                                              ^^^^^^^^^^^^
  //. //                                                                   1
  //. //
  //. //   1)  NaN :: Number
  //. //
  //. //   The value at position 1 is not a member of ‘FiniteNumber’.
  //.
  //. dist(0);
  //. // ! TypeError: Invalid value
  //. //
  //. //   dist :: { x :: FiniteNumber, y :: FiniteNumber } -> { x :: FiniteNumber, y :: FiniteNumber } -> FiniteNumber
  //. //           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //. //                              1
  //. //
  //. //   1)  0 :: Number
  //. //
  //. //   The value at position 1 is not a member of ‘{ x :: FiniteNumber, y :: FiniteNumber }’.
  //. ```
  function RecordType(fields) {
    var keys = Object.keys(fields).sort();

    var invalidFieldNames = keys.filter(function(k) {
      return $$type(fields[k]) !== 'sanctuary-def/Type';
    });
    if (!isEmpty(invalidFieldNames)) {
      throw new TypeError(trimTrailingSpaces(
        'Invalid values\n\n' +
        'The argument to ‘RecordType’ must be an object ' +
          'mapping field name to type.\n\n' +
        'The following mappings are invalid:\n\n' +
        Z.reduce(function(s, k) {
          var v = fields[k];
          return s + '  - ' + Z.toString(k) + ': ' + Z.toString(v) + '\n';
        }, '', invalidFieldNames)
      ));
    }

    var format = function(outer, inner) {
      return wrap(outer('{'))(outer(' }'))(Z.map(function(k) {
        var t = fields[k];
        return outer(' ' + k + ' :: ') +
               unless(t.type === RECORD || isEmpty(t.keys),
                      stripOutermostParens,
                      inner(k)(String(t)));
      }, keys).join(outer(',')));
    };

    var test = function(x) {
      return x != null &&
             keys.every(function(k) { return hasOwnProperty.call(x, k); });
    };

    var $types = {};
    keys.forEach(function(k) {
      $types[k] = {extractor: function(x) { return [x[k]]; }, type: fields[k]};
    });

    return createType(RECORD, '', format, test, keys, $types);
  }
  $.RecordType = RecordType;

  //# TypeVariable :: String -> Type
  //.
  //. Polymorphism is powerful. Not being able to define a function for
  //. all types would be very limiting indeed: one couldn't even define the
  //. identity function!
  //.
  //. Before defining a polymorphic function one must define one or more type
  //. variables:
  //.
  //. ```javascript
  //. const a = $.TypeVariable('a');
  //. const b = $.TypeVariable('b');
  //.
  //. //    id :: a -> a
  //. const id = def('id', {}, [a, a], x => x);
  //.
  //. id(42);
  //. // => 42
  //.
  //. id(null);
  //. // => null
  //. ```
  //.
  //. The same type variable may be used in multiple positions, creating a
  //. constraint:
  //.
  //. ```javascript
  //. //    cmp :: a -> a -> Number
  //. const cmp =
  //. def('cmp', {}, [a, a, $.Number], (x, y) => x < y ? -1 : x > y ? 1 : 0);
  //.
  //. cmp(42, 42);
  //. // => 0
  //.
  //. cmp('a', 'z');
  //. // => -1
  //.
  //. cmp('z', 'a');
  //. // => 1
  //.
  //. cmp(0, '1');
  //. // ! TypeError: Type-variable constraint violation
  //. //
  //. //   cmp :: a -> a -> Number
  //. //          ^    ^
  //. //          1    2
  //. //
  //. //   1)  0 :: Number
  //. //
  //. //   2)  "1" :: String
  //. //
  //. //   Since there is no type of which all the above values are members, the type-variable constraint has been violated.
  //. ```
  function TypeVariable(name) {
    return createType(VARIABLE, name, always2(name), K(true), [], {});
  }
  $.TypeVariable = TypeVariable;

  //# UnaryTypeVariable :: String -> (Type -> Type)
  //.
  //. Combines [`UnaryType`][] and [`TypeVariable`][].
  //.
  //. To define a unary type variable `t a` one must provide:
  //.
  //.   - a name (conventionally matching `^[a-z]$`); and
  //.
  //.   - the type of `a` (exposed as `t.types.$1.type`).
  //.
  //. Consider the type of a generalized `map`:
  //.
  //. ```haskell
  //. map :: Functor f => (a -> b) -> f a -> f b
  //. ```
  //.
  //. `f` is a unary type variable. With two (nullary) type variables, one
  //. unary type variable, and one [type class][] it's possible to define a
  //. fully polymorphic `map` function:
  //.
  //. ```javascript
  //. const $ = require('sanctuary-def');
  //. const Z = require('sanctuary-type-classes');
  //.
  //. const a = $.TypeVariable('a');
  //. const b = $.TypeVariable('b');
  //. const f = $.UnaryTypeVariable('f');
  //.
  //. //    map :: Functor f => (a -> b) -> f a -> f b
  //. const map =
  //. def('map',
  //.     {f: [Z.Functor]},
  //.     [$.Function([a, b]), f(a), f(b)],
  //.     Z.map);
  //. ```
  //.
  //. Whereas a regular type variable is fully resolved (`a` might become
  //. `Array (Array String)`, for example), a unary type variable defers to
  //. its type argument, which may itself be a type variable. The type argument
  //. corresponds to the type argument of a unary type or the *second* type
  //. argument of a binary type. The second type argument of `Map k v`, for
  //. example, is `v`. One could replace `Functor => f` with `Map k` or with
  //. `Map Integer`, but not with `Map`.
  //.
  //. This shallow inspection makes it possible to constrain a value's "outer"
  //. and "inner" types independently.
  function UnaryTypeVariable(name) {
    return function($1) {
      var format = function(outer, inner) {
        return outer('(' + name + ' ') + inner('$1')(String($1)) + outer(')');
      };
      var types = {$1: {extractor: K([]), type: $1}};
      return createType(VARIABLE, name, format, K(true), ['$1'], types);
    };
  }
  $.UnaryTypeVariable = UnaryTypeVariable;

  //# BinaryTypeVariable :: String -> ((Type, Type) -> Type)
  //.
  //. Combines [`BinaryType`][] and [`TypeVariable`][].
  //.
  //. To define a binary type variable `t a b` one must provide:
  //.
  //.   - a name (conventionally matching `^[a-z]$`);
  //.
  //.   - the type of `a` (exposed as `t.types.$1.type`); and
  //.
  //.   - the type of `b` (exposed as `t.types.$2.type`).
  //.
  //. The more detailed explanation of [`UnaryTypeVariable`][] also applies to
  //. `BinaryTypeVariable`.
  function BinaryTypeVariable(name) {
    return function($1, $2) {
      var format = function(outer, inner) {
        return outer('(' + name + ' ') + inner('$1')(String($1)) + outer(' ') +
                                         inner('$2')(String($2)) + outer(')');
      };
      var types = {$1: {extractor: K([]), type: $1},
                   $2: {extractor: K([]), type: $2}};
      return createType(VARIABLE, name, format, K(true), ['$1', '$2'], types);
    };
  }
  $.BinaryTypeVariable = BinaryTypeVariable;

  //. ### Type classes
  //.
  //. `concatS`, defined earlier, is a function which concatenates two strings.
  //. This is overly restrictive, since other types support concatenation
  //. (Array, for example).
  //.
  //. One could use a type variable to define a polymorphic "concat" function:
  //.
  //. ```javascript
  //. //    _concat :: a -> a -> a
  //. const _concat =
  //. def('_concat', {}, [a, a, a], (x, y) => x.concat(y));
  //.
  //. _concat('fizz', 'buzz');
  //. // => 'fizzbuzz'
  //.
  //. _concat([1, 2], [3, 4]);
  //. // => [1, 2, 3, 4]
  //.
  //. _concat([1, 2], 'buzz');
  //. // ! TypeError: Type-variable constraint violation
  //. //
  //. //   _concat :: a -> a -> a
  //. //              ^    ^
  //. //              1    2
  //. //
  //. //   1)  [1, 2] :: Array Number
  //. //
  //. //   2)  "buzz" :: String
  //. //
  //. //   Since there is no type of which all the above values are members, the type-variable constraint has been violated.
  //. ```
  //.
  //. The type of `_concat` is misleading: it suggests that it can operate on
  //. any two values of *any* one type. In fact there's an implicit constraint,
  //. since the type must support concatenation (in [mathematical][semigroup]
  //. terms, the type must have a [semigroup][FL:Semigroup]). The run-time type
  //. errors that result when this constraint is violated are not particularly
  //. descriptive:
  //.
  //. ```javascript
  //. _concat({}, {});
  //. // ! TypeError: undefined is not a function
  //.
  //. _concat(null, null);
  //. // ! TypeError: Cannot read property 'concat' of null
  //. ```
  //.
  //. The solution is to constrain `a` by first defining a [`TypeClass`][]
  //. value, then specifying the constraint in the definition of the "concat"
  //. function:
  //.
  //. ```javascript
  //. const Z = require('sanctuary-type-classes');
  //.
  //. //    Semigroup :: TypeClass
  //. const Semigroup = Z.TypeClass(
  //.   'my-package/Semigroup',
  //.   [],
  //.   x => x != null && typeof x.concat === 'function'
  //. );
  //.
  //. //    concat :: Semigroup a => a -> a -> a
  //. const concat =
  //. def('concat', {a: [Semigroup]}, [a, a, a], (x, y) => x.concat(y));
  //.
  //. concat([1, 2], [3, 4]);
  //. // => [1, 2, 3, 4]
  //.
  //. concat({}, {});
  //. // ! TypeError: Type-class constraint violation
  //. //
  //. //   concat :: Semigroup a => a -> a -> a
  //. //             ^^^^^^^^^^^    ^
  //. //                            1
  //. //
  //. //   1)  {} :: Object, StrMap ???
  //. //
  //. //   ‘concat’ requires ‘a’ to satisfy the Semigroup type-class constraint; the value at position 1 does not.
  //.
  //. concat(null, null);
  //. // ! TypeError: Type-class constraint violation
  //. //
  //. //   concat :: Semigroup a => a -> a -> a
  //. //             ^^^^^^^^^^^    ^
  //. //                            1
  //. //
  //. //   1)  null :: Null
  //. //
  //. //   ‘concat’ requires ‘a’ to satisfy the Semigroup type-class constraint; the value at position 1 does not.
  //. ```
  //.
  //. Multiple constraints may be placed on a type variable by including
  //. multiple `TypeClass` values in the array (e.g. `{a: [Foo, Bar, Baz]}`).

  //  checkValue :: ... -> Undefined
  var checkValue = function(
    env,                // :: Array Type
    typeInfo,           // :: TypeInfo
    $typeVarMapBox,     // :: Box TypeVarMap
    index,              // :: Integer
    propPath,           // :: PropPath
    t,                  // :: Type
    value               // :: Any
  ) {
    if (t.type === VARIABLE) {
      $typeVarMapBox[0] =
        updateTypeVarMap(env, $typeVarMapBox[0], t, index, propPath, [value]);
      if (isEmpty($typeVarMapBox[0][t.name].types)) {
        throw typeVarConstraintViolation(
          env,
          typeInfo,
          index,
          propPath,
          $typeVarMapBox[0][t.name].valuesByPath
        );
      }
    } else if (!$.test(env, t, value)) {
      throw invalidValue(env, typeInfo, index, propPath, value);
    }
  };

  //  wrapFunction :: ... -> Function
  var wrapFunction = function(
    env,                // :: Array Type
    typeInfo,           // :: TypeInfo
    $typeVarMapBox,     // :: Box TypeVarMap
    index,              // :: Integer
    f                   // :: Function
  ) {
    return function() {
      var args = slice.call(arguments);
      var expType = typeInfo.types[index];
      var numArgsExpected = expType.keys.length - 1;
      if (args.length !== numArgsExpected) {
        throw invalidArgumentsLength_(env,
                                      typeInfo,
                                      index,
                                      numArgsExpected,
                                      args);
      }
      var checkValue$ = function(propPath, t, x) {
        checkValue(env,
                   typeInfo,
                   $typeVarMapBox,
                   index,
                   propPath,
                   t,
                   x);
      };
      expType.keys.slice(0, -1).forEach(function(k, idx) {
        checkValue$([k], expType.types[k].type, args[idx]);
      });

      var output = f.apply(this, arguments);
      var k = last(expType.keys);
      checkValue$([k], expType.types[k].type, output);
      return output;
    };
  };

  //  wrapFunctions :: ... -> Array Any
  var wrapFunctions = function(
    env,                // :: Array Type
    typeInfo,           // :: TypeInfo
    $typeVarMapBox,     // :: Box TypeVarMap
    values              // :: Array Any
  ) {
    return values.map(function(value, idx) {
      return typeInfo.types[idx].type === FUNCTION ?
        wrapFunction(env,
                     typeInfo,
                     $typeVarMapBox,
                     idx,
                     value) :
        value;
    });
  };

  //  invalidArgumentsLength :: (String, Integer, Integer) -> Error
  var invalidArgumentsLength = function(name, expectedLength, actualLength) {
    return new TypeError(q(name) +
                         ' requires ' + numArgs(expectedLength) + ';' +
                         ' received ' + numArgs(actualLength));
  };

  //  constraintsRepr :: ... -> String
  var constraintsRepr = function(
    constraints,    // :: StrMap (Array TypeClass)
    outer,          // :: String -> String
    inner           // :: String -> TypeClass -> String -> String
  ) {
    var $reprs = [];
    Object.keys(constraints).sort().forEach(function(k) {
      var f = inner(k);
      constraints[k].forEach(function(typeClass) {
        $reprs.push(f(typeClass)(stripNamespace(typeClass.name) + ' ' + k));
      });
    });
    return when($reprs.length > 0,
                function(s) { return s + outer(' => '); },
                when($reprs.length > 1,
                     wrap(outer('('))(outer(')')),
                     $reprs.join(outer(', '))));
  };

  //  label :: String -> String -> String
  var label = function(label) {
    return function(s) {
      var delta = s.length - label.length;
      return strRepeat(' ', Math.floor(delta / 2)) + label +
             strRepeat(' ', Math.ceil(delta / 2));
    };
  };

  //  showType :: Type -> String
  var showType = function(t) {
    return unless(t.type === FUNCTION || t.type === RECORD || isEmpty(t.keys),
                  stripOutermostParens,
                  String(t));
  };

  //  showTypeQuoted :: Type -> String
  var showTypeQuoted = function(t) {
    return q(unless(t.type === RECORD || isEmpty(t.keys),
                    stripOutermostParens,
                    String(t)));
  };

  //  showValuesAndTypes :: (Array Type, Array Any, Integer) -> String
  var showValuesAndTypes = function(env, values, pos) {
    return String(pos) + ')  ' + Z.map(function(x) {
      var types = determineActualTypesLoose(env, env, [x]);
      return Z.toString(x) + ' :: ' + Z.map(showType, types).join(', ');
    }, values).join('\n    ');
  };

  //  typeSignature :: TypeInfo -> String
  var typeSignature = function(typeInfo) {
    return typeInfo.name + ' :: ' +
             constraintsRepr(typeInfo.constraints, id, K(K(id))) +
             Z.map(showType, typeInfo.types).join(' -> ');
  };

  //  _underline :: ... -> String
  var _underline = function recur(
    t,              // :: Type
    propPath,       // :: PropPath
    formatType3     // :: Type -> Array String -> String -> String
  ) {
    return unless(t.type === RECORD ||
                    isEmpty(t.keys) ||
                    t.type === FUNCTION && isEmpty(propPath) ||
                    !isEmpty(propPath),
                  stripOutermostParens,
                  formatType3(t)(propPath)(t.format(_, function(k) {
                    return K(recur(t.types[k].type,
                                   Z.concat(propPath, [k]),
                                   formatType3));
                  })));
  };

  //  underline :: ... -> String
  var underline = function(
    typeInfo,               // :: TypeInfo
    underlineConstraint,    // :: String -> TypeClass -> String -> String
    formatType5             // :: Integer -> (String -> String) -> Type ->
                            //      PropPath -> String -> String
  ) {
    var st = typeInfo.types.reduce(function(st, t, index) {
      var formatType4 = formatType5(index);
      var counter = st.counter;
      var replace = function(s) { return label(String(counter += 1))(s); };
      return {
        carets: Z.concat(st.carets, [_underline(t, [], formatType4(r('^')))]),
        numbers: Z.concat(st.numbers,
                          [_underline(t, [], formatType4(replace))]),
        counter: counter
      };
    }, {carets: [], numbers: [], counter: 0});

    return typeSignature(typeInfo) + '\n' +
           _(typeInfo.name + ' :: ') +
             constraintsRepr(typeInfo.constraints, _, underlineConstraint) +
             st.carets.join(_(' -> ')) + '\n' +
           _(typeInfo.name + ' :: ') +
             constraintsRepr(typeInfo.constraints, _, K(K(_))) +
             st.numbers.join(_(' -> ')) + '\n';
  };

  //  resolvePropPath :: (Type, Array String) -> Type
  var resolvePropPath = function(t, propPath) {
    return Z.reduce(function(t, prop) { return t.types[prop].type; },
                    t,
                    propPath);
  };

  //  formatType6 ::
  //    PropPath -> Integer -> (String -> String) ->
  //      Type -> PropPath -> String -> String
  var formatType6 = function(indexedPropPath) {
    return function(index_) {
      return function(f) {
        return function(t) {
          return function(propPath_) {
            var indexedPropPath_ = Z.concat([index_], propPath_);
            var p = isPrefix(indexedPropPath_)(indexedPropPath);
            var q = isPrefix(indexedPropPath)(indexedPropPath_);
            return p && q ? f : p ? id : _;
          };
        };
      };
    };
  };

  //  typeClassConstraintViolation :: ... -> Error
  var typeClassConstraintViolation = function(
    env,            // :: Array Type
    typeInfo,       // :: TypeInfo
    typeClass,      // :: TypeClass
    index,          // :: Integer
    propPath,       // :: PropPath
    value,          // :: Any
    typeVarMap      // :: TypeVarMap
  ) {
    var expType = resolvePropPath(typeInfo.types[index], propPath);
    return new TypeError(trimTrailingSpaces(
      'Type-class constraint violation\n\n' +
      underline(typeInfo,
                function(tvn) {
                  return function(tc) {
                    return tvn === expType.name && tc.name === typeClass.name ?
                      r('^') :
                      _;
                  };
                },
                formatType6(Z.concat([index], propPath))) +
      '\n' +
      showValuesAndTypes(env, [value], 1) + '\n\n' +
      q(typeInfo.name) + ' requires ' + q(expType.name) + ' to satisfy the ' +
      stripNamespace(typeClass.name) + ' type-class constraint; ' +
      'the value at position 1 does not.\n'
    ));
  };

  //  typeVarConstraintViolation :: ... -> Error
  var typeVarConstraintViolation = function(
    env,            // :: Array Type
    typeInfo,       // :: TypeInfo
    index,          // :: Integer
    propPath,       // :: PropPath
    valuesByPath    // :: StrMap (Array Any)
  ) {
    //  If we apply an ‘a -> a -> a -> a’ function to Left('x'), Right(1), and
    //  Right(null) we'd like to avoid underlining the first argument position,
    //  since Left('x') is compatible with the other ‘a’ values.
    var key = JSON.stringify(Z.concat([index], propPath));
    var values = valuesByPath[key];

    //  Note: Sorting these keys lexicographically is not "correct", but it
    //  does the right thing for indexes less than 10.
    var keys = Object.keys(valuesByPath).sort().filter(function(k) {
      var values_ = valuesByPath[k];
      return (
        //  Keep X, the position at which the violation was observed.
        k === key ||
        //  Keep positions whose values are incompatible with the values at X.
        isEmpty(determineActualTypesStrict(env,
                                           env,
                                           Z.concat(values, values_)))
      );
    });

    return new TypeError(trimTrailingSpaces(
      'Type-variable constraint violation\n\n' +
      underlineTypeVars(typeInfo,
                        Z.reduce(function($valuesByPath, k) {
                          $valuesByPath[k] = valuesByPath[k];
                          return $valuesByPath;
                        }, {}, keys)) +
      Z.reduce(function(st, k) {
        var values = valuesByPath[k];
        return isEmpty(values) ? st : {
          idx: st.idx + 1,
          s: st.s + '\n' + showValuesAndTypes(env, values, st.idx + 1) + '\n'
        };
      }, {idx: 0, s: ''}, keys).s + '\n' +
      'Since there is no type of which all the above values are ' +
      'members, the type-variable constraint has been violated.\n'
    ));
  };

  //  invalidValue :: ... -> Error
  var invalidValue = function(
    env,            // :: Array Type
    typeInfo,       // :: TypeInfo
    index,          // :: Integer
    propPath,       // :: PropPath
    value           // :: Any
  ) {
    return new TypeError(trimTrailingSpaces(
      'Invalid value\n\n' +
      underline(typeInfo,
                K(K(_)),
                formatType6(Z.concat([index], propPath))) +
      '\n' +
      showValuesAndTypes(env, [value], 1) + '\n\n' +
      'The value at position 1 is not a member of ' +
      showTypeQuoted(resolvePropPath(typeInfo.types[index], propPath)) + '.\n'
    ));
  };

  //  invalidArgumentsLength_ :: ... -> Error
  var invalidArgumentsLength_ = function(
    env,                // :: Array Type
    typeInfo,           // :: TypeInfo
    index,              // :: Integer
    numArgsExpected,    // :: Integer
    args                // :: Array Any
  ) {
    return new TypeError(trimTrailingSpaces(
      q(typeInfo.name) + ' applied ' + showTypeQuoted(typeInfo.types[index]) +
      ' to the wrong number of arguments\n\n' +
      underline(
        typeInfo,
        K(K(_)),
        function(index_) {
          return function(f) {
            return function(t) {
              return function(propPath) {
                return function(s) {
                  return index_ === index ?
                    String(t).replace(
                      /^[(](.*) -> (.*)[)]$/,
                      function(s, $1, $2) {
                        return _('(') + f($1) + _(' -> ' + $2 + ')');
                      }
                    ) :
                    _(s);
                };
              };
            };
          };
        }
      ) + '\n' +
      'Expected ' + numArgs(numArgsExpected) +
      ' but received ' + numArgs(args.length) +
      (args.length === 0 ?
         '.\n' :
         Z.reduce(function(s, x) { return s + '  - ' + Z.toString(x) + '\n'; },
                  ':\n\n',
                  args))
    ));
  };

  //  assertRight :: Either (() -> Error) a -> a !
  var assertRight = function(either) {
    if (either.isLeft) throw either.value();
    return either.value;
  };

  //  Options :: Type
  var Options = RecordType({checkTypes: $.Boolean, env: $.Array($.Any)});

  //  create :: Options -> Function
  $.create = function(opts) {
    assertRight(satisfactoryTypes($.env,
                                  {name: 'create',
                                   constraints: {},
                                   types: [Options, $.AnyFunction]},
                                  {},
                                  Options,
                                  0,
                                  [],
                                  [opts]));

    //  checkTypes :: Boolean
    var checkTypes = opts.checkTypes;

    //  env :: Array Type
    var env = applyParameterizedTypes(opts.env);

    //  curry :: ... -> Function
    var curry = function curry(
      typeInfo,     // :: TypeInfo
      _typeVarMap,  // :: TypeVarMap
      _values,      // :: Array Any
      _indexes,     // :: Array Integer
      impl          // :: Function
    ) {
      var n = typeInfo.types.length - 1;
      var curried = arity(_indexes.length, function() {
        if (checkTypes) {
          var delta = _indexes.length - arguments.length;
          if (delta < 0) {
            throw invalidArgumentsLength(typeInfo.name, n, n - delta);
          }
        }
        var typeVarMap = _typeVarMap;
        var values = _values.slice();
        var indexes = [];
        for (var idx = 0; idx < _indexes.length; idx += 1) {
          var index = _indexes[idx];

          if (idx < arguments.length &&
              !(typeof arguments[idx] === 'object' &&
                arguments[idx] != null &&
                arguments[idx]['@@functional/placeholder'] === true)) {

            var value = arguments[idx];
            if (checkTypes) {
              var result = satisfactoryTypes(env,
                                             typeInfo,
                                             typeVarMap,
                                             typeInfo.types[index],
                                             index,
                                             [],
                                             [value]);
              typeVarMap = assertRight(result).typeVarMap;
            }
            values[index] = value;
          } else {
            indexes.push(index);
          }
        }
        if (isEmpty(indexes)) {
          if (checkTypes) {
            var returnValue = impl.apply(this,
                                         wrapFunctions(env,
                                                       typeInfo,
                                                       [typeVarMap],
                                                       values));
            assertRight(satisfactoryTypes(env,
                                          typeInfo,
                                          typeVarMap,
                                          typeInfo.types[n],
                                          n,
                                          [],
                                          [returnValue]));
            return returnValue;
          } else {
            return impl.apply(this, values);
          }
        } else {
          return curry(typeInfo, typeVarMap, values, indexes, impl);
        }
      });
      curried.inspect = curried.toString = always(typeSignature(typeInfo));
      return curried;
    };

    return function def(name, constraints, expTypes, impl) {
      if (checkTypes) {
        if (arguments.length !== def.length) {
          throw invalidArgumentsLength('def', def.length, arguments.length);
        }

        var types = [$.String,
                     $.StrMap($.Array(TypeClass)),
                     $.Array(Type),
                     $.AnyFunction,
                     $.AnyFunction];
        var typeInfo = {name: 'def', constraints: {}, types: types};
        forEach.call(arguments, function(arg, idx) {
          assertRight(satisfactoryTypes($.env,
                                        typeInfo,
                                        {},
                                        types[idx],
                                        idx,
                                        [],
                                        [arg]));
        });
      }

      var values = new Array(expTypes.length - 1);
      if (values.length > 9) {
        throw new RangeError(q('def') + ' cannot define a function ' +
                             'with arity greater than nine');
      }

      return curry({name: name, constraints: constraints, types: expTypes},
                   {},
                   values,
                   range(0, values.length),
                   impl);
    };
  };

  return $;

}));

//. [FL:Semigroup]:         https://github.com/fantasyland/fantasy-land#semigroup
//. [`AnyFunction`]:        #AnyFunction
//. [`Arguments`]:          #Arguments
//. [`Array`]:              #Array
//. [`BinaryType`]:         #BinaryType
//. [`Boolean`]:            #Boolean
//. [`Date`]:               #Date
//. [`Error`]:              #Error
//. [`FiniteNumber`]:       #FiniteNumber
//. [`GlobalRegExp`]:       #GlobalRegExp
//. [`Integer`]:            #Integer
//. [`NonGlobalRegExp`]:    #NonGlobalRegExp
//. [`Null`]:               #Null
//. [`Number`]:             #Number
//. [`Object`]:             #Object
//. [`Object.create`]:      https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/create
//. [`Pair`]:               #Pair
//. [`RegExp`]:             #RegExp
//. [`StrMap`]:             #StrMap
//. [`String`]:             #String
//. [`SyntaxError`]:        https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SyntaxError
//. [`TypeClass`]:          https://github.com/sanctuary-js/sanctuary-type-classes#TypeClass
//. [`TypeError`]:          https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypeError
//. [`TypeVariable`]:       #TypeVariable
//. [`UnaryType`]:          #UnaryType
//. [`UnaryTypeVariable`]:  #UnaryTypeVariable
//. [`Undefined`]:          #Undefined
//. [`ValidNumber`]:        #ValidNumber
//. [`env`]:                #env
//. [arguments]:            https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/arguments
//. [enumerated types]:     https://en.wikipedia.org/wiki/Enumerated_type
//. [max]:                  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER
//. [min]:                  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MIN_SAFE_INTEGER
//. [record type]:          #RecordType
//. [semigroup]:            https://en.wikipedia.org/wiki/Semigroup
//. [type class]:           #type-classes
//. [type variables]:       #TypeVariable
//. [types]:                #types
