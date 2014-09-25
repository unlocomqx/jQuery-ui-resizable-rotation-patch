$(document).ready(function(){

	function n(e) {
		return parseInt(e, 10) || 0
	}

	//patch: totally based on andyzee work here, thank you
	//patch: https://github.com/andyzee/jquery-resizable-rotation-patch/blob/master/resizable-rotation.patch.js
	//patch: search for "patch:" comments for modifications
	//patch: based on version jquery-ui-1.10.3
	//patch: can be easily reproduced with your current version
	//patch: start of patch
	/**
	* Calculate the size correction for resized rotated element
	* @param {Number} init_w
	* @param {Number} init_h
	* @param {Number} delta_w
	* @param {Number} delta_h
	* @param {Number} angle in degrees
	* @returns {object} correction css object {left, top}
	*/
	$.getCorrection = function(init_w, init_h, delta_w, delta_h, angle){
		//Convert angle from degrees to radians
		var angle = angle * Math.PI / 180

		//Get position after rotation with original size
		var x = -init_w/2;
		var y = init_h/2;
		var new_x = y * Math.sin(angle) + x * Math.cos(angle);
		var new_y = y * Math.cos(angle) - x * Math.sin(angle);
		var diff1 = {left: new_x - x, top: new_y - y};

		var new_width = init_w + delta_w;
		var new_height = init_h + delta_h;

		//Get position after rotation with new size
		var x = -new_width/2;
		var y = new_height/2;
		var new_x = y * Math.sin(angle) + x * Math.cos(angle);
		var new_y = y * Math.cos(angle) - x * Math.sin(angle);
		var diff2 = {left: new_x - x, top: new_y - y};

		//Get the difference between the two positions
		var offset = {left: diff2.left - diff1.left, top: diff2.top - diff1.top};
		return offset;
	}

	$.ui.resizable.prototype._mouseStart = function(event) {

		var curleft, curtop, cursor,
		o = this.options,
		el = this.element;

		this.resizing = true;

		this._renderProxy();

		curleft = n(this.helper.css("left"));
		curtop = n(this.helper.css("top"));

		if (o.containment) {
			curleft += $(o.containment).scrollLeft() || 0;
			curtop += $(o.containment).scrollTop() || 0;
		}

		this.offset = this.helper.offset();
		this.position = { left: curleft, top: curtop };

		this.size = this._helper ? {
			width: this.helper.width(),
			height: this.helper.height()
		} : {
			width: el.width(),
			height: el.height()
		};

		this.originalSize = this._helper ? {
			width: el.outerWidth(),
			height: el.outerHeight()
		} : {
			width: el.width(),
			height: el.height()
		};

		this.sizeDiff = {
			width: el.outerWidth() - el.width(),
			height: el.outerHeight() - el.height()
		};

		this.originalPosition = { left: curleft, top: curtop };
		this.originalMousePosition = { left: event.pageX, top: event.pageY };

		//patch: object to store previous data
		this.lastData = this.originalPosition;

		this.aspectRatio = (typeof o.aspectRatio === "number") ?
		o.aspectRatio :
		((this.originalSize.width / this.originalSize.height) || 1);

		cursor = $(".ui-resizable-" + this.axis).css("cursor");
		$("body").css("cursor", cursor === "auto" ? this.axis + "-resize" : cursor);

		el.addClass("ui-resizable-resizing");
		this._propagate("start", event);
		return true;
	};

	$.ui.resizable.prototype._mouseDrag = function(event) {
		//patch: get the angle
		var angle = getAngle(this.element[0]);
		var angle_rad = angle * Math.PI / 180;

		var data,
		el = this.helper, props = {},
		smp = this.originalMousePosition,
		a = this.axis,
		prevTop = this.position.top,
		prevLeft = this.position.left,
		prevWidth = this.size.width,
		prevHeight = this.size.height,
		dx = (event.pageX-smp.left)||0,
		dy = (event.pageY-smp.top)||0,
		trigger = this._change[a];

		var init_w = this.size.width;
		var init_h = this.size.height;

		if (!trigger) {
			return false;
		}

		//patch: cache cosine & sine
		var _cos = Math.cos(angle_rad);
		var _sin = Math.sin(angle_rad);

		//patch: calculate the corect mouse offset for a more natural feel
		ndx = dx * _cos + dy * _sin;
		ndy = dy * _cos - dx * _sin;
		dx = ndx;
		dy = ndy;

		// Calculate the attrs that will be change
		data = trigger.apply(this, [event, dx, dy]);

		// Put this in the mouseDrag handler since the user can start pressing shift while resizing
		this._updateVirtualBoundaries(event.shiftKey);
		if (this._aspectRatio || event.shiftKey) {
			data = this._updateRatio(data, event);
		}

		data = this._respectSize(data, event);

		//patch: backup the position
		var oldPosition = {left: this.position.left, top: this.position.top};

		this._updateCache(data);

		//patch: revert to old position
		this.position = {left: oldPosition.left, top: oldPosition.top};

		//patch: difference between datas
		var diffData = {
			left: _parseFloat(data.left || this.lastData.left) - _parseFloat(this.lastData.left),
			top:  _parseFloat(data.top || this.lastData.top)  - _parseFloat(this.lastData.top),
		}

		//patch: calculate the correct position offset based on angle
		var new_data = {};
		new_data.left = diffData.left * _cos - diffData.top  * _sin;
		new_data.top  = diffData.top  * _cos + diffData.left * _sin;

		//patch: round the values
		new_data.left = _round(new_data.left);
		new_data.top  = _round(new_data.top);

		//patch: update the position
		this.position.left += new_data.left;
		this.position.top  += new_data.top;

		//patch: save the data for later use
		this.lastData = {
			left: _parseFloat(data.left || this.lastData.left),
			top:  _parseFloat(data.top  || this.lastData.top)
		};

		// plugins callbacks need to be called first
		this._propagate("resize", event);

		//patch: calculate the difference in size
		var diff_w = init_w - this.size.width;
		var diff_h = init_h - this.size.height;

		//patch: get the offset based on angle
		var offset = $.getCorrection(init_w, init_h, diff_w, diff_h, angle);

		//patch: update the position
		this.position.left += offset.left;
		this.position.top -= offset.top;

		if (this.position.top !== prevTop) {
			props.top = this.position.top + "px";
		}
		if (this.position.left !== prevLeft) {
			props.left = this.position.left + "px";
		}
		if (this.size.width !== prevWidth) {
			props.width = this.size.width + "px";
		}
		if (this.size.height !== prevHeight) {
			props.height = this.size.height + "px";
		}
		el.css(props);

		if (!this._helper && this._proportionallyResizeElements.length) {
			this._proportionallyResize();
		}

		// Call the user callback if the element was resized
		if ( ! $.isEmptyObject(props) ) {
			this._trigger("resize", event, this.ui());
		}

		return false;
	}

	//patch: get the angle
	function getAngle(el) {
		var st = window.getComputedStyle(el, null);
		var tr = st.getPropertyValue("-webkit-transform") ||
		st.getPropertyValue("-moz-transform") ||
		st.getPropertyValue("-ms-transform") ||
		st.getPropertyValue("-o-transform") ||
		st.getPropertyValue("transform") ||
		null;
		if(tr && tr != "none"){
			var values = tr.split('(')[1];
			values = values.split(')')[0];
			values = values.split(',');

			var a = values[0];
			var b = values[1];

			var angle = Math.round(Math.atan2(b, a) * (180/Math.PI));
			while(angle >= 360) angle = 360-angle;
			while(angle < 0) angle = 360+angle;
			return angle;
		}
		else
			return 0;
	}

	function _parseFloat(e) {
		return isNaN(parseFloat(e)) ? 0: parseFloat(e);
	}

	function _round(e) {
		return Math.round((e + 0.00001) * 100) / 100
	}
	/* end of patch functions */
});
