(function($){
    $.fn.dependingSelects = function(options) {
        // Extend our default options with those provided.
        var opts = $.extend({}, $.fn.dependingSelects.defaults, options);
        // Iterate each matched element.
        return this.each(function() {
            var $this = $(this);

            new DependingSelect($this, opts);
        });
    };

    var DependingSelect = function($context, options) {
        var selects = options.selects;
        var nameDataDefaultOptionText = "defaultOptionText";
        var nameDataPreselectedValue = "preselectedValue";
        var nameDataVehicleTypes = "vehicleTypes";

        if(!$context) return; // $context = main container of selects

        // go through each select box and set settings
        $.each(selects, function(index, name) {
            var $elem = $context.find("select[name='" + name + "']"); // ref to related select

            // TODO: was ist wenn element nicht existiert?
            // do check if element length > 0, otherwise remove
            //if($elem.length === 0) {
                //selects.splice(index,1); // remove entry from array
            //}

            // disable all fields except the first one
            if(index !== 0) {
                $elem.prop('disabled');
            }

            // may we have former data saved, so remove it
            $elem.removeData([nameDataDefaultOptionText, nameDataPreselectedValue, nameDataVehicleTypes]);

            // save the value in data to preselect
            if(options.preselectSelects[name]) {
                $elem.data(nameDataPreselectedValue, options.preselectSelects[name]);
            }

            // store default option text in data
            $elem.data(nameDataDefaultOptionText, $elem.find("option:first").text());

            // unbind possible former event bindings e.g. if we initialized it twice
            $elem.off("change.dependingSelects");

            // bind the change event
            $elem.on("change.dependingSelects", function(e) {
                var preselectedValue = $(this).data(nameDataPreselectedValue); // get the value saved in data
                var trackClick = e.isTrigger ? false : true; // we only want to track if it is a selection done by the user

                if(trackClick) {
                    track(name);
                }

                // remove preselect value for the first select because otherwise the value will be still there for the next time and so no tracking will be done
                if(index === 0) {
                    $elem.removeData(nameDataPreselectedValue);
                }

                // if there exists a further element
                if(hasNextElement(name)) {
                    // load data a.s.o.
                    perform($elem);
                } else {
                    var wasPreselected = preselectedValue ? true : false;
                    // remove highlighting of current element
                    $elem.removeClass("active");
                    $elem.blur();

                    // fire event selection is finished
                    // second argument is to know if we have to track VehicleSelected
                    // but we don't want to track VehicleSelected if it is a preselection

                    options.onVehicleSelectedEnd($context, wasPreselected);
                }
            });
        });

        function perform($elem) {
            var value = $elem.val(); // selected value
            var obj = {"params": {}}; // obj to store value, params and so on
            var name = $elem.attr("name"); // name of the select
            var nextName = getNextElementName(name); // name of the next select
            var $nextElem = $context.find("select[name='" + nextName + "']"); // ref to next select
            var $constructionTimeYearElem = $context.find("select[name='" + options.nameConstructionTimeYearElem + "']"); // ref to construction time year select

            // reset all furhter selects
            resetNextElements(name);

            // if no real value is selected or if no next element exists
            if(value === "" || $nextElem.length === 0) return;

            // add loading msg and show if not already shown
            $nextElem.html('<option value="">' + options.loadingMessage + '</option>').fadeIn(800).css("display", "block");

            obj.value = value;

            // normally we use the value of the further element
            // but if we have to use a value of another element, the info has to be set in the options in delegateRequestValue in this way: {"elem": "baureihe", "useElemValue": "hersteller"}
            $.each(options.delegateRequestValue, function() {
                if(this.elem === nextName) {
                    var elemType = this.type ? this.type : "select"; // default element type is "select"
                    var delegateElem;

                    if(elemType === "checkbox") {
                        delegateElem = $context.find("input[name='" + this.useElemValue + "']:checked");
                    } else {
                        delegateElem = $context.find(elemType + "[name='" + this.useElemValue + "']");
                    }

                    if(delegateElem.length > 0) { // TODO: eigentlich noch prüfen, ob es einen gescheiten wert hat
                        obj.value = delegateElem.val(); // overwrite the standard value with the one of the delegate element
                    }
                }
            });

            // do default request (for all except construction time elements)
            // for construction time month we don't need a request. We saved the construction time map in data of the month element

            loadData(function(jqXHR, textStatus) {
                if (textStatus === "success") {
                    var data = getStringAsJson(jqXHR.responseText);
                    var html = [];

                    // if there are no entries
                    if(!data.length) {
                        trackError('Vehicle Selection, No options for ' + nextName + ' with id ' + value);
                    } else { // if entries available
                        // default handling, add all options if options in data.categories are available
                        if(data.categories && data.categories.length === 0) {
                            html.push('<option disabled="disabled" value="">' + options.noOptionsText + '</option>');

                            track(nextName + " (no entries available)");
                        } else {
                            $.each(data.categories, function(i, item) {
                                if(item.visible) {
                                    html.push('<option value="' + item.id + '">' + item.name + '</option>');
                                }
                            });
                        }
                    }


                    // write options
                    populateOptions(html, $elem, $nextElem);
               } else {
                    trackError('Vehicle Selection, Getting options for ' + nextName + ' with id ' + value);
               }
            }, obj);
        } // perform

        function populateOptions(html, $elem, $nextElem) {
            var defaultOptionText = $nextElem.data(nameDataDefaultOptionText);
            var $nextElemOption;
            // do preselection, delete value after preselection
            var preselectedValue = $nextElem.data(nameDataPreselectedValue); // get the value saved in data

            // remove highlighting
            $elem.removeClass("active");

            // add default option add the beginning
            if(defaultOptionText && defaultOptionText.length > 0) {
                html.unshift('<option value="">' + defaultOptionText + '</option>');
            }

            // fill the element with all options and set it active
            $nextElem.html(html.join('')).removeAttr("disabled").addClass("active").trigger("focus");

            // do auto select of option if only one option is available
            // do check of preslection if more than one option is available
            $nextElemOption = $nextElem.find("option[value!='']");
            if($nextElemOption.length === 1) {
                $nextElemOption.prop("selected", true);
                $nextElem.trigger("change");
            } else {

                if(preselectedValue) {
                    var $preselectedOption = $nextElem.find("option[value='" + preselectedValue + "']");

                    // check if option is available
                    if($preselectedOption.length > 0) {
                        $nextElem.val(preselectedValue).trigger("change");
                    } else {
                        // do reset of next preselect values if option isn't available, because the next values can't be the right ones
                        // TODO: we do not use it at the moment
                        /*$.each(selects, function(index, name) {
                            $context.find("select[name='" + name + "']").removeData(nameDataPreselectedValue);
                        });*/
                    }
                }
            }

            // remove the preselection info because we only want the preslection at the very first time
            $nextElem.removeData(nameDataPreselectedValue);
        }

        function track(text) {
            //
        }

        function trackError(text) {
            //
        }

        /*
         * returns null if no furhter entry exists
         */
        function getNextElementName(currentElementName) {
            for(var i = 0; i < selects.length; i++) {
                if(selects[i] === currentElementName) {
                    if(i < selects.length + 1)
                        return selects[i + 1];
                    else
                        return null;
                }
            }
        }

        function hasNextElement(currentElementName) {
            var nextName = getNextElementName(currentElementName);

            if(nextName && $context.find("select[name='" + nextName + "']").length > 0) {
                return true;
            } else {
                return false;
            }
        }

        function resetNextElements(currentElementName) {
            var nextName = getNextElementName(currentElementName);

            while(nextName !== null) {
                var $nextElem = $context.find("select[name='" + nextName + "']"); // ref to next select
                var defaultOptionText = $nextElem.data(nameDataDefaultOptionText);

                $nextElem.attr('disabled','disabled').removeClass("active").empty().html('<option value="">' + defaultOptionText + '</option>'); // ref to next select

                nextName = getNextElementName(nextName);

                // fire event
                options.onResetNextElements($context);
            }
        }

        function loadData(complete, obj) {
            $.ajax({
                type: "GET",
                url: 'http://114.215.109.245:8080/numa/api/locations',
                complete: complete
            });
        } // loadData
    };

    // Plugin defaults – added as a property on our plugin function.
    $.fn.dependingSelects.defaults = {
        selects: ['province', 'city', 'county'],
        loadingMessage: 'Loading, please wait ...',
        noOptionsText: 'No options. Please change your region.',
        delegateRequestValue: [
            {"elem": "baureihe", "useElemValue": "hersteller"}, // take value of hersteller to request options for baureihe
            {"elem": "vehicleConstructionYear", "useElemValue": "fza", "type": "checkbox"}
        ],
        preselectSelects: {},
        onVehicleSelectedEnd: function($context, wasPreselected) {
            var vehicleObj;

            $context.parents("form").find(".error-message").hide();

            $.each($context.find("select[name='fahrzeugtyp']").data("vehicleTypes").types, function(i, value) {
                if(value.id === $context.find("select[name='fahrzeugtyp']").val()) {
                    vehicleObj = value;
                }
            });

            vehicleSelected($context, vehicleObj, $context.find("select[name='vehicleConstructionYear']").val(), $context.find("select[name='vehicleConstructionMonth']").val(), wasPreselected);
          /*  options.onVehicleSelectedEndTriggerElem($context);
        },
        onVehicleSelectedEndTriggerElem: function($context) {
            // get the next visible selection element
            var elems = $(".form-vehicle-selection").nextAll("div[class^=form-]:visible:eq(0)").find("input:eq(0)").trigger("focus");
            */
        },
        onResetNextElements: function($context) {
            //$('#cta').removeClass("active");
        }
    };
})(jQuery);