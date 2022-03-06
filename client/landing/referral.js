(function ($) {
  $.fn.customerPopup = function (e, url, width, height, resize) {

    // Prevent default anchor event
    e.preventDefault();

    // Set values for window
    width = width || '500';
    height = height || '400';
    resize = (resize ? 'yes' : 'no');

    // Set title and open popup with focus on it
    var title = ((typeof this.attr('title') !== undefined) ? this.attr('title') : 'Social Share'),
      params = 'width=' + width + ',height=' + height + ',resizable=' + resize,
      url = ((typeof url !== undefined) ? url : this.attr('title')),
      object = null;

    object = window.open(url, title, params).focus();
  }
}(jQuery));

function getQueryStrings() {
  var assoc = {};
  var decode = function (s) {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  };
  var queryString = location.search.substring(1);
  var keyValues = queryString.split('&');

  for (var i in keyValues) {
    var key = keyValues[i].split('=');
    if (key.length > 1) {
      assoc[decode(key[0])] = decode(key[1]);
    }
  }
  return assoc;
}

function copyToClipboard(text) {
  if (window.clipboardData && window.clipboardData.setData) {
    // Internet Explorer-specific code path to prevent textarea being shown while dialog is visible.
    return window.clipboardData.setData("Text", text);

  }
  else if (document.queryCommandSupported && document.queryCommandSupported("copy")) {
    var textarea = document.createElement("textarea");
    textarea.textContent = text;
    textarea.style.position = "fixed";  // Prevent scrolling to bottom of page in Microsoft Edge.
    document.body.appendChild(textarea);
    textarea.select();
    try {
      return document.execCommand("copy");  // Security exception may be thrown by some browsers.
    }
    catch (ex) {
      console.warn("Copy to clipboard failed.", ex);
      return prompt("Copy to clipboard: Ctrl+C, Enter", text);
    }
    finally {
      document.body.removeChild(textarea);
    }
  }
}

// https://github.com/bradvin/social-share-urls/blob/master/code/javascript/javascript/social-share-media.js
function getShareLink(target, url, text) {
  var href = null;

  url = encodeURIComponent(url);
  text = encodeURIComponent(text);

  switch (target) {
    case 'facebook':
      href = 'http://www.facebook.com/sharer.php?u=' + url;
      break;

    case 'twitter':
      href = 'https://twitter.com/share?text=' + text + '&amp;url=' + url;
      break;

    case 'linkedin':
      href = 'http://www.linkedin.com/shareArticle?mini=true&url=' + url;
      break;

    case 'whatsapp':
      href = 'https://api.whatsapp.com/send?text=' + text + '%20' + url;
      break;
    
    case 'instagram':
      href = '';
      break;
  };

  return href;
}

function updateSocialLinks(url) {
  $('.share-link').each(function () {
    var target = $(this).data('target');
    var text = '';
    var href = getShareLink(target, url, text);

    $(this).attr('href', href);
    $(this).click(function (e) {
      // e.preventDefault();
      $(this).customerPopup(e, href);
    });
  });
}

var shareDomain = "https://lsd.formaviva.com/";
var referralEndpoint = "http://0.0.0.0:3001";

function initReferral(referralEndpoint, shareDomain) {
  $('#referralForm').on('submit', function (e) {
    e.preventDefault();
    $.ajax({
      url: referralEndpoint + '/invite',
      type: "GET", // POST
      data: {
        'email': $('#email').val(),
        'name': $('#name').val(),
        'referrer': $('#referrer').val()
      },
      success: function (res) {
        var referralCode = res.referral_code;
        var referralLink = shareDomain + "?ref=" + referralCode;

        // alert('Your referral code is: ' + res.referral_code);
        // var text = `Your referral code is: ${res.referral_code}, position: ${res.num_row}`

        $("#positionNum").text(res.num_row);
        $("#referralLink").val(referralLink);
        $("#referralCode").text(referralCode);
        $("#copylink").click(function() {
          copyToClipboard(referralLink);
        });

        updateSocialLinks(referralLink);
        toggleModal('apply-modal', false);
        toggleModal('share-modal', true);

        // loadLeaderboard();
      },
      error: function (jqXHR, textStatus, errorMessage) {
        alert(errorMessage);
      }
    });
  });

}